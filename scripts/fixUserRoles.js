// scripts/fixUserRoles.js - FINAL FIXED VERSION
import { initializeModels, getSequelize } from '../src/models/index.js';

async function fixUserRoles() {
  try {
    console.log('🔧 Fixing corrupted user role data...\n');
    
    await initializeModels();
    
    const sequelize = getSequelize();
    
    // First, let's check what columns actually exist in the UserRole table
    console.log('📋 Checking UserRole table structure...');
    const columnsResult = await sequelize.query(
      `SHOW COLUMNS FROM user_roles`,
      { type: sequelize.QueryTypes.SHOWTABLES }
    );
    
    console.log('Raw columns result:', JSON.stringify(columnsResult, null, 2));
    
    // Handle different return formats
    let columns = [];
    if (Array.isArray(columnsResult)) {
      columns = columnsResult.filter(col => col !== null);
    } else if (columnsResult && typeof columnsResult === 'object') {
      // If it's an object, convert to array and filter nulls
      columns = Object.values(columnsResult).filter(col => col !== null);
    }
    
    if (columns.length === 0) {
      console.log('⚠️ No columns found or table does not exist');
    } else {
      console.log('Columns in user_roles table:');
      columns.forEach((col, index) => {
        if (col && typeof col === 'object') {
          const fieldName = col.Field || col.column_name || col.field || `column_${index}`;
          const dataType = col.Type || col.data_type || col.type || 'unknown';
          console.log(`  ${index + 1}. ${fieldName} (${dataType})`);
        } else {
          console.log(`  ${index + 1}. ${col} (raw value)`);
        }
      });
    }
    
    // Find the primary key column - try different approaches
    let primaryKeyColumn = null;
    
    // Try to find primary key from columns
    for (const col of columns) {
      if (col && typeof col === 'object') {
        const fieldName = col.Field || col.column_name || col.field;
        const keyType = col.Key || col.key || col.column_key;
        
        if (keyType === 'PRI' || keyType === 'PRIMARY' || keyType === 'PRI') {
          primaryKeyColumn = fieldName;
          break;
        }
      }
    }
    
    // If no primary key found, use common column names
    if (!primaryKeyColumn) {
      const possibleKeys = ['id', 'user_role_id', 'role_id', 'user_id'];
      for (const key of possibleKeys) {
        const exists = columns.some(col => {
          if (col && typeof col === 'object') {
            return (col.Field === key || col.column_name === key || col.field === key);
          }
          return col === key;
        });
        if (exists) {
          primaryKeyColumn = key;
          break;
        }
      }
    }
    
    // Default to 'id' if nothing found
    primaryKeyColumn = primaryKeyColumn || 'id';
    console.log(`\n🔑 Using primary key column: ${primaryKeyColumn}`);
    
    // Get all user roles
    console.log('\n📊 Fetching all user roles...');
    const allUserRoles = await sequelize.query(
      `SELECT * FROM user_roles`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    console.log(`Found ${allUserRoles.length} user role records`);
    
    // Process each record
    for (let i = 0; i < allUserRoles.length; i++) {
      const record = allUserRoles[i];
      const recordId = record[primaryKeyColumn] || record.id || record.user_role_id || record.role_id || `record_${i}`;
      
      console.log(`\n📝 Processing record ${i + 1}/${allUserRoles.length} (ID: ${recordId})`);
      
      // Log the raw record for debugging
      console.log('  Raw record:', JSON.stringify(record, null, 2).substring(0, 200) + '...');
      
      let fixed = false;
      let fixedUserRoleIds = null;
      let fixedRoleNms = null;
      
      // Fix USER_ROLE_IDS
      if (record.USER_ROLE_IDS) {
        try {
          const originalValue = record.USER_ROLE_IDS;
          console.log(`  USER_ROLE_IDS type: ${typeof originalValue}`);
          
          if (typeof originalValue === 'string') {
            console.log(`  Original (first 100 chars): ${originalValue.substring(0, 100)}`);
            
            // Try to parse it multiple times
            let parsed = originalValue;
            let parseCount = 0;
            
            while (typeof parsed === 'string' && parseCount < 10) {
              try {
                parsed = JSON.parse(parsed);
                parseCount++;
              } catch {
                break;
              }
            }
            
            // If we got an array, clean it up
            if (Array.isArray(parsed)) {
              fixedUserRoleIds = parsed.map(item => {
                if (typeof item === 'string') {
                  // Remove brackets, quotes, and trim
                  return item.replace(/[\[\]"]/g, '').trim();
                }
                return item;
              }).filter(Boolean);
              
              fixed = true;
              console.log(`  ✅ Parsed USER_ROLE_IDS (after ${parseCount} parses):`, fixedUserRoleIds);
            } else if (parsed && typeof parsed === 'object') {
              // If it's an object, extract values
              fixedUserRoleIds = Object.values(parsed).map(item => {
                if (typeof item === 'string') {
                  return item.replace(/[\[\]"]/g, '').trim();
                }
                return item;
              }).filter(Boolean);
              
              fixed = true;
              console.log(`  ✅ Extracted USER_ROLE_IDS from object:`, fixedUserRoleIds);
            } else {
              console.log(`  ⚠️ Could not parse USER_ROLE_IDS, got:`, typeof parsed);
            }
          } else if (Array.isArray(originalValue)) {
            fixedUserRoleIds = originalValue;
            fixed = true;
            console.log(`  ✅ USER_ROLE_IDS already array:`, fixedUserRoleIds);
          }
        } catch (e) {
          console.log(`  ❌ Error processing USER_ROLE_IDS: ${e.message}`);
        }
      }
      
      // Fix ROLE_NMS
      if (record.ROLE_NMS) {
        try {
          const originalValue = record.ROLE_NMS;
          console.log(`  ROLE_NMS type: ${typeof originalValue}`);
          
          if (typeof originalValue === 'string') {
            console.log(`  Original (first 100 chars): ${originalValue.substring(0, 100)}`);
            
            // Try to parse it multiple times
            let parsed = originalValue;
            let parseCount = 0;
            
            while (typeof parsed === 'string' && parseCount < 10) {
              try {
                parsed = JSON.parse(parsed);
                parseCount++;
              } catch {
                break;
              }
            }
            
            // If we got an array, clean it up
            if (Array.isArray(parsed)) {
              fixedRoleNms = parsed.map(item => {
                if (typeof item === 'string') {
                  return item.replace(/[\[\]"]/g, '').trim();
                }
                return item;
              }).filter(Boolean);
              
              fixed = true;
              console.log(`  ✅ Parsed ROLE_NMS (after ${parseCount} parses):`, fixedRoleNms);
            } else if (parsed && typeof parsed === 'object') {
              // If it's an object, extract values
              fixedRoleNms = Object.values(parsed).map(item => {
                if (typeof item === 'string') {
                  return item.replace(/[\[\]"]/g, '').trim();
                }
                return item;
              }).filter(Boolean);
              
              fixed = true;
              console.log(`  ✅ Extracted ROLE_NMS from object:`, fixedRoleNms);
            } else {
              console.log(`  ⚠️ Could not parse ROLE_NMS, got:`, typeof parsed);
            }
          } else if (Array.isArray(originalValue)) {
            fixedRoleNms = originalValue;
            fixed = true;
            console.log(`  ✅ ROLE_NMS already array:`, fixedRoleNms);
          }
        } catch (e) {
          console.log(`  ❌ Error processing ROLE_NMS: ${e.message}`);
        }
      }
      
      // If we fixed anything, update the database
      if (fixed && recordId && recordId !== `record_${i}`) {
        try {
          const updates = [];
          const replacements = [];
          
          if (fixedUserRoleIds) {
            updates.push('USER_ROLE_IDS = ?');
            replacements.push(JSON.stringify(fixedUserRoleIds));
          }
          if (fixedRoleNms) {
            updates.push('ROLE_NMS = ?');
            replacements.push(JSON.stringify(fixedRoleNms));
          }
          
          if (updates.length > 0) {
            replacements.push(recordId);
            const updateQuery = `UPDATE user_roles SET ${updates.join(', ')} WHERE ${primaryKeyColumn} = ?`;
            
            console.log(`  Executing update for record ${recordId}`);
            await sequelize.query(updateQuery, {
              replacements: replacements,
              type: sequelize.QueryTypes.UPDATE
            });
            
            console.log(`  ✅ Updated record ${recordId}`);
          }
        } catch (updateError) {
          console.log(`  ❌ Failed to update record: ${updateError.message}`);
        }
      } else if (fixed) {
        console.log(`  ⚠️ Cannot update record without valid ID`);
      } else {
        console.log(`  ⚠️ No fixes needed for this record`);
      }
    }
    
    console.log('\n✅ Fix completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Run a simple check to verify fixes');
    console.log('2. Try the API endpoint again');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

fixUserRoles();