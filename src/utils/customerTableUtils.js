// utils/customerTableUtils.js - COMPLETE UPDATED VERSION
export const ensureCustomerTableColumns = async (sequelize) => {
  try {
    if (!sequelize) {
      console.error('❌ Sequelize instance not provided');
      return false;
    }
    
    console.log('🔍 Checking customers table structure...');
    
    // First, check if customers table exists
    try {
      const [tableCheck] = await sequelize.query(
        `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'customers'`
      );
      
      if (tableCheck[0].count === 0) {
        console.error('❌ customers table does not exist');
        return false;
      }
    } catch (tableError) {
      console.error('❌ Error checking customers table existence:', tableError.message);
      return false;
    }
    
    // List of columns that should exist based on your model
    const columnsToCheck = [
      { name: 'EVENT_ID', type: 'VARCHAR(50)', nullable: true },
      { name: 'APPROVED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'APPROVED_DT', type: 'DATETIME', nullable: true },
      { name: 'SUSPENDED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'SUSPENDED_DT', type: 'DATETIME', nullable: true },
      { name: 'SUSPENSION_REASON', type: 'TEXT', nullable: true },
      { name: 'CLOSED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'CLOSED_DT', type: 'DATETIME', nullable: true },
      { name: 'CLOSURE_REASON', type: 'TEXT', nullable: true },
      { name: 'REJECTED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'REJECTED_DT', type: 'DATETIME', nullable: true },
      { name: 'REJECTION_REASON', type: 'TEXT', nullable: true },
      { name: 'customer_type_id', type: 'INTEGER', nullable: true },
      { name: 'relationship_officer_id', type: 'INTEGER', nullable: true },
      { name: 'createdAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
    ];
    
    let addedCount = 0;
    let errorCount = 0;
    
    for (const column of columnsToCheck) {
      try {
        const [check] = await sequelize.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'customers' 
           AND COLUMN_NAME = ?`,
          { replacements: [column.name] }
        );
        
        if (check[0].count === 0) {
          console.log(`   ➕ Adding ${column.name} column to customers table...`);
          
          let alterQuery = `ALTER TABLE customers ADD COLUMN ${column.name} ${column.type}`;
          
          if (column.nullable === false) {
            alterQuery += ' NOT NULL';
          } else {
            alterQuery += ' NULL';
          }
          
          if (column.defaultValue) {
            alterQuery += ` DEFAULT ${column.defaultValue}`;
          }
          
          await sequelize.query(alterQuery);
          console.log(`   ✅ ${column.name} column added successfully`);
          addedCount++;
        } else {
          console.log(`   ✓ ${column.name} column already exists`);
        }
      } catch (error) {
        errorCount++;
        console.warn(`   ⚠️ Error checking/adding ${column.name} column:`, error.message);
        // Continue with other columns
      }
    }
    
    console.log(`✅ Customers table structure verified. Added ${addedCount} columns, ${errorCount} errors.`);
    return true;
  } catch (error) {
    console.error('❌ Error ensuring customer table columns:', error.message);
    return false;
  }
};

// 🔥 UPDATED FUNCTION: Check if specific columns exist
export const checkColumnExists = async (sequelize, tableName, columnName) => {
  try {
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ? 
       AND COLUMN_NAME = ?`,
      { replacements: [tableName, columnName] }
    );
    
    return result[0].count > 0;
  } catch (error) {
    console.error(`❌ Error checking column ${columnName} in table ${tableName}:`, error.message);
    return false;
  }
};

// 🔥 UPDATED FUNCTION: Add column if it doesn't exist
export const addColumnIfMissing = async (sequelize, tableName, columnName, columnType, options = {}) => {
  try {
    // First check if table exists
    const [tableExists] = await sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = ?`,
      { replacements: [tableName] }
    );
    
    if (tableExists[0].count === 0) {
      console.error(`❌ Table ${tableName} does not exist`);
      return false;
    }
    
    const exists = await checkColumnExists(sequelize, tableName, columnName);
    
    if (!exists) {
      console.log(`➕ Adding ${columnName} column to ${tableName} table...`);
      
      let alterQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
      
      if (options.nullable === false) {
        alterQuery += ' NOT NULL';
      } else {
        alterQuery += ' NULL';
      }
      
      if (options.defaultValue) {
        alterQuery += ` DEFAULT ${options.defaultValue}`;
      }
      
      await sequelize.query(alterQuery);
      console.log(`✅ ${columnName} column added successfully to ${tableName}`);
      return true;
    }
    
    console.log(`✅ ${columnName} column already exists in ${tableName}`);
    return false;
  } catch (error) {
    console.error(`❌ Error adding column ${columnName} to table ${tableName}:`, error.message);
    return false;
  }
};

// 🔥 NEW FUNCTION: Quick ensure EVENT_ID column exists (most common issue)
export const ensureEventIdColumn = async (sequelize) => {
  try {
    if (!sequelize) {
      console.error('❌ Sequelize instance not provided');
      return false;
    }
    
    console.log('🔍 Quick check for EVENT_ID column...');
    
    return await addColumnIfMissing(
      sequelize,
      'customers',
      'EVENT_ID',
      'VARCHAR(50)',
      { nullable: true }
    );
  } catch (error) {
    console.error('❌ Error ensuring EVENT_ID column:', error.message);
    return false;
  }
};

// 🔥 NEW FUNCTION: Ensure basic columns for customer operations
export const ensureEssentialCustomerColumns = async (sequelize) => {
  try {
    if (!sequelize) return false;
    
    console.log('🔍 Ensuring essential customer columns...');
    
    const essentialColumns = [
      { name: 'EVENT_ID', type: 'VARCHAR(50)', nullable: true },
      { name: 'APPROVED_BY', type: 'VARCHAR(100)', nullable: true },
      { name: 'APPROVED_DT', type: 'DATETIME', nullable: true },
      { name: 'createdAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'DATETIME', nullable: false, defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
    ];
    
    let success = true;
    
    for (const column of essentialColumns) {
      const columnSuccess = await addColumnIfMissing(
        sequelize,
        'customers',
        column.name,
        column.type,
        { 
          nullable: column.nullable !== false,
          defaultValue: column.defaultValue 
        }
      );
      
      if (!columnSuccess) {
        success = false;
      }
    }
    
    console.log(success ? '✅ Essential columns ensured' : '⚠️ Some essential columns may be missing');
    return success;
  } catch (error) {
    console.error('❌ Error ensuring essential customer columns:', error.message);
    return false;
  }
};

// 🔥 NEW FUNCTION: Get safe customer attributes (excludes columns that might not exist)
export const getSafeCustomerAttributes = () => {
  return [
    'id', 'CUST_ID', 'CUST_NO', 'TITLE_ID', 'FIRST_NAME', 'MIDDLE_NAME', 
    'LAST_NAME', 'CUST_NM', 'HOME_ADDRESS', 'EMAIL_ADDRESS', 'BU_ID', 
    'MAIDEN_NM', 'BIRTH_DT', 'CNTRY_OF_BIRTH_ID', 'CUST_CAT', 'CAMPAIGN_ID', 
    'GENDER_TY', 'COUNTRY_NM', 'STATE', 'NIN', 'BVN', 'LOCAL_GOV', 
    'OPENING_RSN_ID', 'OPENED_DT', 'RESIDENT_CNTRY_ID', 'RISK_CLASS', 
    'STMNT_FREQ_CD', 'STMNT_FREQ_VALUE', 'CREATED_BY', 'USER_ID', 'CREATE_DT', 
    'INDUSTRY_ID', 'INDUSTRY_CD', 'TAX_STATUS', 'MARITAL_ST', 'TAX_GRP_ID', 
    'OPERATIONS_CRNCY_ID', 'EMP_ST', 'ORGANISATION_NM', 'REGISTRATION_ADDRESS', 
    'REGISTRATION_DT', 'ALERT_DELIVERY_METHOD', 'KYC_LEVEL', 'PHONE_NO', 'SMS', 
    'IS_PEP', 'SANCTION_SCORE', 'DOCUMENT_VERIFICATION_STATUS', 'REC_ST', 'status'
  ];
};

// 🔥 NEW FUNCTION: Get customer attributes with optional columns
export const getCustomerAttributesWithOptional = async (sequelize) => {
  const baseAttributes = getSafeCustomerAttributes();
  const optionalColumns = [
    'EVENT_ID', 'APPROVED_BY', 'APPROVED_DT', 'SUSPENDED_BY', 
    'SUSPENDED_DT', 'CLOSED_BY', 'CLOSED_DT', 'REJECTED_BY', 
    'REJECTED_DT', 'createdAt', 'updatedAt'
  ];
  
  const finalAttributes = [...baseAttributes];
  
  if (sequelize) {
    for (const column of optionalColumns) {
      const exists = await checkColumnExists(sequelize, 'customers', column);
      if (exists) {
        finalAttributes.push(column);
      }
    }
  }
  
  return finalAttributes;
};

// 🔥 NEW FUNCTION: Initialize customer system (call on app startup)
export const initializeCustomerSystem = async (sequelize) => {
  try {
    console.log('🚀 Initializing customer system...');
    
    if (!sequelize) {
      console.error('❌ Sequelize instance not provided');
      return false;
    }
    
    // Ensure essential columns exist
    const schemaResult = await ensureEssentialCustomerColumns(sequelize);
    
    if (!schemaResult) {
      console.warn('⚠️ Customer schema initialization had issues');
    }
    
    console.log('✅ Customer system initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize customer system:', error.message);
    return false;
  }
};