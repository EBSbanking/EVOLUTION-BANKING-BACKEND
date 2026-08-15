// src/utils/removeDuplicates.js
import dotenv from 'dotenv';
import sequelize from '../../config/db.js';

dotenv.config();

/**
 * Remove duplicate deposit records from deposit_transactions table
 * This checks for duplicates based on account_number, amount, and date
 */
async function removeDuplicateDeposits() {
  console.log('🔍 Checking for duplicate deposit records in deposit_transactions...');

  try {
    // Check if deposit_transactions table exists
    const [tableExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'deposit_transactions'`
    );

    if (tableExists[0].count === 0) {
      console.log('⚠️ Table deposit_transactions does not exist, skipping...');
      return;
    }

    // ✅ FIND DUPLICATES - This is where your query goes
    const [duplicates] = await sequelize.query(`
      SELECT 
        account_number,
        amount,
        DATE(transaction_date) as deposit_date,
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY created_at DESC) as ids
      FROM deposit_transactions
      WHERE transaction_type IN ('DEPOSIT', 'CR', 'CREDIT')
        AND status NOT IN ('REJECTED', 'FAILED', 'DUPLICATE')
      GROUP BY 
        account_number, 
        amount, 
        DATE(transaction_date)
      HAVING duplicate_count > 1
    `);

    if (!duplicates || duplicates.length === 0) {
      console.log('✅ No duplicate deposit records found');
      return;
    }

    console.log(`🔍 Found ${duplicates.length} duplicate groups`);

    let totalRemoved = 0;
    let totalProcessed = 0;

    for (const duplicate of duplicates) {
      const { account_number, amount, deposit_date, ids, duplicate_count } = duplicate;
      const idArray = ids.split(',').map(id => parseInt(id.trim()));
      
      if (idArray.length <= 1) continue;

      // Keep the first one (oldest), mark the rest as duplicates
      const [keepId, ...removeIds] = idArray;

      if (removeIds.length > 0) {
        console.log(`   📝 Account: ${account_number} - Amount: ${amount} - Date: ${deposit_date} - Keeping ID ${keepId}, removing ${removeIds.length} duplicates`);
        
        // ✅ Mark as duplicate (soft delete) instead of hard delete
        await sequelize.query(
          `UPDATE deposit_transactions 
           SET status = 'DUPLICATE', 
               description = CONCAT(description, ' [DUPLICATE - Original ID: ', ?, ']'),
               updated_at = NOW()
           WHERE id IN (?) AND id != ?`,
          { replacements: [keepId, removeIds, keepId] }
        );
        
        totalRemoved += removeIds.length;
        totalProcessed++;
      }
    }

    console.log(`✅ Processed ${totalProcessed} duplicate groups, marked ${totalRemoved} records as DUPLICATE`);
    
    if (totalRemoved > 0) {
      const [remainingCount] = await sequelize.query(
        `SELECT COUNT(*) as count FROM deposit_transactions WHERE status != 'DUPLICATE' AND transaction_type IN ('DEPOSIT', 'CR', 'CREDIT')`
      );
      console.log(`📊 Active deposits after cleanup: ${remainingCount[0].count}`);
    }

  } catch (error) {
    console.error('❌ Error removing duplicates:', error.message);
    throw error;
  }
}

/**
 * Remove duplicates from any table (generic function)
 */
async function removeDuplicatesFromTable({ table, duplicateField, orderBy = 'id', keepStrategy = 'first' }) {
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

    const quotedField = duplicateField.includes('_') ? `\`${duplicateField}\`` : duplicateField;

    const [duplicates] = await sequelize.query(`
      SELECT 
        ${quotedField} as dup_value,
        COUNT(*) as duplicate_count,
        GROUP_CONCAT(id ORDER BY ${orderBy}) as ids
      FROM ${table}
      WHERE ${quotedField} IS NOT NULL
        AND ${quotedField} != ''
      GROUP BY ${quotedField}
      HAVING duplicate_count > 1
      LIMIT 1000
    `);

    if (!duplicates || duplicates.length === 0) {
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

      let keepId;
      if (keepStrategy === 'last') {
        keepId = idArray[idArray.length - 1];
        const removeIds = idArray.slice(0, -1);
        if (removeIds.length > 0) {
          await sequelize.query(
            `DELETE FROM ${table} WHERE id IN (?)`,
            { replacements: [removeIds] }
          );
          removedCount += removeIds.length;
          processedCount++;
        }
      } else {
        // Keep first (oldest)
        const [firstId, ...removeIds] = idArray;
        if (removeIds.length > 0) {
          await sequelize.query(
            `DELETE FROM ${table} WHERE id IN (?)`,
            { replacements: [removeIds] }
          );
          removedCount += removeIds.length;
          processedCount++;
        }
      }
    }

    console.log(`   ✅ Removed ${removedCount} duplicate records from ${processedCount} groups in ${table}`);

  } catch (error) {
    console.error(`   ❌ Error cleaning ${table}:`, error.message);
    // Don't throw - just log and continue
  }
}

/**
 * Clean duplicates from all tables
 */
async function cleanupAllDuplicates() {
  console.log('🧹 Starting comprehensive duplicate cleanup...');
  
  const tablesToClean = [
    { table: 'deposit_transactions', duplicateField: 'transaction_ref_no', keepStrategy: 'first' },
    { table: 'deposit_transactions', duplicateField: 'account_number', keepStrategy: 'first' },
    { table: 'customer_accounts', duplicateField: 'account_number', keepStrategy: 'first' },
    { table: 'customer_accounts', duplicateField: 'CUST_ID', keepStrategy: 'first' },
    { table: 'transaction_policies', duplicateField: 'policy_id', keepStrategy: 'first' },
    { table: 'gl_accounts', duplicateField: 'gl_acct_no', keepStrategy: 'first' },
  ];
  
  for (const config of tablesToClean) {
    try {
      await removeDuplicatesFromTable(config);
    } catch (error) {
      console.error(`❌ Failed to clean ${config.table}:`, error.message);
    }
  }
  
  console.log('🧹 Duplicate cleanup completed!');
}

/**
 * Main execution – runs on server startup
 */
async function main() {
  console.log('🚀 Starting duplicate removal script...');
  
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to MySQL database');

    // Clean deposit_transactions duplicates
    await removeDuplicateDeposits();
    
    // Optionally clean other tables (uncomment if needed)
    // await cleanupAllDuplicates();
    
    console.log('🎉 Script completed successfully');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    // Do not throw – let the server continue
  }
}

// Export functions for use in other scripts
export { 
  removeDuplicateDeposits, 
  removeDuplicatesFromTable,
  cleanupAllDuplicates,
  main
};

// Run the script if called directly
// main().catch(console.error);