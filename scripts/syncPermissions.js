// syncPermissions.js - FIXED VERSION
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up one level to project root (since this script is in scripts/ folder)
const projectRoot = resolve(__dirname, '..');

// Load environment variables from the project root
dotenv.config({ path: resolve(projectRoot, '.env') });

async function runSync() {
  try {
    console.log('🔄 Starting permission synchronization...');
    
    // Test database connection
    console.log('🔗 Testing database connection...');
    
    // Import the database config
    const dbConfig = await import('../config/db.js');
    
    let sequelize;
    
    // Check different export patterns
    if (dbConfig.default && dbConfig.default.authenticate) {
      sequelize = dbConfig.default;
    } else if (dbConfig.getSequelize && typeof dbConfig.getSequelize === 'function') {
      sequelize = dbConfig.getSequelize();
    } else if (dbConfig.sequelize) {
      sequelize = dbConfig.sequelize;
    } else if (dbConfig.default.sequelize) {
      sequelize = dbConfig.default.sequelize;
    } else if (dbConfig.authenticate) {
      sequelize = dbConfig;
    } else {
      console.error('❌ Could not find sequelize instance');
      process.exit(1);
    }
    
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // First, check if the column exists and fix it if needed
    await checkAndFixTableSchema(sequelize);
    
    // Create or update permissions table with correct schema
    console.log('📝 Creating/updating permissions table...');
    await createPermissionsTable(sequelize);
    
    // Import role mapping
    console.log('📋 Importing role mapping...');
    const { ROLE_MAPPING } = await import('../src/constants/roleMapping.js');
    
    if (!ROLE_MAPPING) {
      console.error('❌ Could not import ROLE_MAPPING');
      process.exit(1);
    }
    
    console.log(`🔄 Syncing ${Object.keys(ROLE_MAPPING).length} roles...`);
    
    // Sync each role
    for (const [roleId, roleData] of Object.entries(ROLE_MAPPING)) {
      console.log(`  📋 Processing role: ${roleData.ROLE_NM} (ID: ${roleId})`);
      await syncRolePermissions(sequelize, parseInt(roleId), roleData);
    }
    
    console.log('✅ Permission synchronization completed successfully!');
    
    // Show summary
    await showSummary(sequelize);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to sync permissions:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

async function checkAndFixTableSchema(sequelize) {
  try {
    // Check if the table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'core_banking' 
      AND TABLE_NAME = 'permissions'
    `);
    
    if (tables.length > 0) {
      // Check if b_u__r_o_l_e__i_d column exists
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = 'core_banking' 
        AND TABLE_NAME = 'permissions'
        AND COLUMN_NAME = 'b_u__r_o_l_e__i_d'
      `);
      
      if (columns.length > 0) {
        const column = columns[0];
        console.log(`📊 Found column: ${column.COLUMN_NAME} (Nullable: ${column.IS_NULLABLE}, Default: ${column.COLUMN_DEFAULT})`);
        
        // If column is NOT NULL without default, fix it
        if (column.IS_NULLABLE === 'NO' && !column.COLUMN_DEFAULT) {
          console.log('🔧 Fixing b_u__r_o_l_e__i_d column to allow NULL values...');
          await sequelize.query(`
            ALTER TABLE permissions 
            MODIFY COLUMN b_u__r_o_l_e__i_d INT NULL
          `);
          console.log('✅ Column fixed to allow NULL values');
        }
      } else {
        console.log('ℹ️  b_u__r_o_l_e__i_d column not found in permissions table');
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not check/fix table schema:', error.message);
  }
}

async function createPermissionsTable(sequelize) {
  try {
    // First, check if the table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'core_banking' 
      AND TABLE_NAME = 'permissions'
    `);
    
    if (tables.length === 0) {
      console.log('📋 Creating permissions table...');
      await sequelize.query(`
        CREATE TABLE permissions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          role_id INT NOT NULL UNIQUE,
          b_u__r_o_l_e__i_d INT NULL,  -- ADDED: Business Unit Role ID (nullable)
          role_name VARCHAR(255),
          is_active BOOLEAN DEFAULT TRUE,
          description TEXT,
          vault_access_level JSON DEFAULT (JSON_ARRAY()),
          customer_access_level JSON DEFAULT (JSON_ARRAY()),
          account_access_level JSON DEFAULT (JSON_ARRAY()),
          loan_operations_access_level JSON DEFAULT (JSON_ARRAY()),
          report_access_level JSON DEFAULT (JSON_ARRAY()),
          system_admin_access_level JSON DEFAULT (JSON_ARRAY()),
          dashboard_access_level JSON DEFAULT (JSON_ARRAY()),
          drawer_access_level JSON DEFAULT (JSON_ARRAY()),
          loan_fee_access_level JSON DEFAULT (JSON_ARRAY()),
          credit_appl_access_level JSON DEFAULT (JSON_ARRAY()),
          posting_access_level JSON DEFAULT (JSON_ARRAY()),
          transaction_access_level JSON DEFAULT (JSON_ARRAY()),
          deposit_access_level JSON DEFAULT (JSON_ARRAY()),
          treasury_access_level JSON DEFAULT (JSON_ARRAY()),
          analytics_access_level JSON DEFAULT (JSON_ARRAY()),
          performance_access_level JSON DEFAULT (JSON_ARRAY()),
          statistics_access_level JSON DEFAULT (JSON_ARRAY()),
          permission_management_access_level JSON DEFAULT (JSON_ARRAY()),
          security_profile_access_level JSON DEFAULT (JSON_ARRAY()),
          user_management_access_level JSON DEFAULT (JSON_ARRAY()),
          approval_access_level JSON DEFAULT (JSON_ARRAY()),
          workflow_access_level JSON DEFAULT (JSON_ARRAY()),
          operations_access_level JSON DEFAULT (JSON_ARRAY()),
          bulk_operations_access_level JSON DEFAULT (JSON_ARRAY()),
          print_export_access_level JSON DEFAULT (JSON_ARRAY()),
          queue_access_level JSON DEFAULT (JSON_ARRAY()),
          aml_access_level JSON DEFAULT (JSON_ARRAY()),
          risk_access_level JSON DEFAULT (JSON_ARRAY()),
          reconciliation_access_level JSON DEFAULT (JSON_ARRAY()),
          product_access_level JSON DEFAULT (JSON_ARRAY()),
          rate_access_level JSON DEFAULT (JSON_ARRAY()),
          business_unit_access_level JSON DEFAULT (JSON_ARRAY()),
          guarantor_access_level JSON DEFAULT (JSON_ARRAY()),
          group_access_level JSON DEFAULT (JSON_ARRAY()),
          fixed_asset_access_level JSON DEFAULT (JSON_ARRAY()),
          thrift_access_level JSON DEFAULT (JSON_ARRAY()),
          standing_order_access_level JSON DEFAULT (JSON_ARRAY()),
          collection_access_level JSON DEFAULT (JSON_ARRAY()),
          loan_portfolio_access_level JSON DEFAULT (JSON_ARRAY()),
          audit_access_level JSON DEFAULT (JSON_ARRAY()),
          notification_access_level JSON DEFAULT (JSON_ARRAY()),
          agency_access_level JSON DEFAULT (JSON_ARRAY()),
          mobile_access_level JSON DEFAULT (JSON_ARRAY()),
          marketing_access_level JSON DEFAULT (JSON_ARRAY()),
          holiday_access_level JSON DEFAULT (JSON_ARRAY()),
          help_access_level JSON DEFAULT (JSON_ARRAY()),
          loan_repayment_access_level JSON DEFAULT (JSON_ARRAY()),
          group_loan_access_level JSON DEFAULT (JSON_ARRAY()),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_role_id (role_id),
          INDEX idx_bu_role_id (b_u__r_o_l_e__i_d)  -- ADDED: Index for better performance
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('✅ Permissions table created');
    } else {
      console.log('📋 Permissions table already exists');
      
      // Check if we need to add missing columns
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = 'core_banking' 
        AND TABLE_NAME = 'permissions'
      `);
      
      const columnNames = columns.map(col => col.COLUMN_NAME);
      
      // Define all possible permission columns - ADD b_u__r_o_l_e__i_d here
      const permissionColumns = [
        'role_id', 'b_u__r_o_l_e__i_d', 'role_name', 'is_active', 'description',
        'vault_access_level', 'customer_access_level', 'account_access_level',
        'loan_operations_access_level', 'report_access_level',
        'system_admin_access_level', 'dashboard_access_level',
        'drawer_access_level', 'loan_fee_access_level', 'credit_appl_access_level',
        'posting_access_level', 'transaction_access_level', 'deposit_access_level',
        'treasury_access_level', 'analytics_access_level', 'performance_access_level',
        'statistics_access_level', 'permission_management_access_level',
        'security_profile_access_level', 'user_management_access_level',
        'approval_access_level', 'workflow_access_level', 'operations_access_level',
        'bulk_operations_access_level', 'print_export_access_level', 'queue_access_level',
        'aml_access_level', 'risk_access_level', 'reconciliation_access_level',
        'product_access_level', 'rate_access_level', 'business_unit_access_level',
        'guarantor_access_level', 'group_access_level', 'fixed_asset_access_level',
        'thrift_access_level', 'standing_order_access_level', 'collection_access_level',
        'loan_portfolio_access_level', 'audit_access_level', 'notification_access_level',
        'agency_access_level', 'mobile_access_level', 'marketing_access_level',
        'holiday_access_level', 'help_access_level', 'loan_repayment_access_level',
        'group_loan_access_level'
      ];
      
      // Add missing columns
      for (const column of permissionColumns) {
        if (!columnNames.includes(column)) {
          console.log(`  ➕ Adding missing column: ${column}`);
          
          let columnType = 'JSON DEFAULT (JSON_ARRAY())';
          if (column === 'role_id') columnType = 'INT NOT NULL';
          if (column === 'b_u__r_o_l_e__i_d') columnType = 'INT NULL';  // ADDED: Make it nullable
          if (column === 'role_name') columnType = 'VARCHAR(255)';
          if (column === 'is_active') columnType = 'BOOLEAN DEFAULT TRUE';
          if (column === 'description') columnType = 'TEXT';
          
          await sequelize.query(`ALTER TABLE permissions ADD COLUMN ${column} ${columnType}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error creating/updating permissions table:', error.message);
    throw error;
  }
}

async function syncRolePermissions(sequelize, roleId, roleData) {
  try {
    // Clean and prepare permissions data - ADD b_u__r_o_l_e__i_d here
    const permissionsData = {
      role_id: roleId,
      b_u__r_o_l_e__i_d: null,  // ADDED: Default to NULL since we don't have this data
      role_name: roleData.ROLE_NM,
      is_active: true,
      description: `Permissions for ${roleData.ROLE_NM}`,
    };
    
    // Process each permission group
    if (roleData.permissions) {
      Object.entries(roleData.permissions).forEach(([group, permissions]) => {
        // Convert group name to snake_case and ensure it ends with _access_level
        let columnName = group.toLowerCase().replace(/_access_level$/i, '').replace(/[^a-z0-9]/g, '_') + '_access_level';
        
        // Fix common issues: remove double underscores
        columnName = columnName.replace(/__/g, '_');
        
        // Filter out undefined permissions and ensure they're valid strings
        const cleanPermissions = Array.isArray(permissions) 
          ? permissions.filter(p => p !== undefined && typeof p === 'string' && p.trim() !== '')
          : [];
        
        if (cleanPermissions.length > 0) {
          permissionsData[columnName] = JSON.stringify(cleanPermissions);
          console.log(`    📝 Adding ${cleanPermissions.length} permissions to ${columnName}`);
        }
      });
    }
    
    // Check if record exists
    const [existing] = await sequelize.query(
      'SELECT id FROM permissions WHERE role_id = ?',
      { replacements: [roleId] }
    );
    
    if (existing.length > 0) {
      // Update existing record
      const updateFields = Object.keys(permissionsData)
        .filter(key => key !== 'role_id')
        .map(key => `${key} = ?`)
        .join(', ');
      
      const updateValues = Object.keys(permissionsData)
        .filter(key => key !== 'role_id')
        .map(key => permissionsData[key]);
      
      updateValues.push(roleId); // For WHERE clause
      
      await sequelize.query(
        `UPDATE permissions SET ${updateFields} WHERE role_id = ?`,
        { replacements: updateValues }
      );
      
      console.log(`    ✅ Updated permissions for ${roleData.ROLE_NM}`);
    } else {
      // Insert new record
      const insertFields = Object.keys(permissionsData).join(', ');
      const insertPlaceholders = Object.keys(permissionsData).map(() => '?').join(', ');
      const insertValues = Object.values(permissionsData);
      
      await sequelize.query(
        `INSERT INTO permissions (${insertFields}) VALUES (${insertPlaceholders})`,
        { replacements: insertValues }
      );
      
      console.log(`    ✅ Created permissions for ${roleData.ROLE_NM}`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`    ❌ Error syncing role ${roleData.ROLE_NM}:`, error.message);
    
    // If it's a column error, show which column is problematic
    if (error.message.includes('Unknown column')) {
      const match = error.message.match(/Unknown column '([^']+)'/);
      if (match) {
        console.error(`    ⚠️  Missing column: ${match[1]}`);
        console.error(`    💡 You need to add this column to the permissions table`);
      }
    }
    
    return false;
  }
}

async function showSummary(sequelize) {
  try {
    console.log('\n📊 Permission Summary:');
    
    // Count total permissions
    const [permissionCount] = await sequelize.query('SELECT COUNT(*) as count FROM permissions');
    console.log(`  Total permission records: ${permissionCount[0].count}`);
    
    // Count active permissions
    const [activePermissions] = await sequelize.query(
      'SELECT COUNT(*) as count FROM permissions WHERE is_active = 1'
    );
    console.log(`  Active permission records: ${activePermissions[0].count}`);
    
    // Show roles with permissions
    const [roles] = await sequelize.query(`
      SELECT p.role_id, p.role_name, 
             COUNT(p.id) as permission_groups,
             p.is_active
      FROM permissions p
      GROUP BY p.role_id, p.role_name, p.is_active
      ORDER BY p.role_id
    `);
    
    console.log('\n👥 Roles with permissions:');
    if (roles.length === 0) {
      console.log('  No roles found in permissions table');
    } else {
      roles.forEach(role => {
        console.log(`  ${role.role_id}. ${role.role_name} (${role.permission_groups} groups) - ${role.is_active ? 'Active' : 'Inactive'}`);
      });
    }
    
    // Show permission statistics
    console.log('\n📈 Permission Statistics:');
    const [stats] = await sequelize.query(`
      SELECT 
        'Vault Permissions' as category,
        COUNT(DISTINCT p.role_id) as roles_with_access
      FROM permissions p
      WHERE JSON_LENGTH(p.vault_access_level) > 0
      UNION
      SELECT 
        'Customer Permissions' as category,
        COUNT(DISTINCT p.role_id) as roles_with_access
      FROM permissions p
      WHERE JSON_LENGTH(p.customer_access_level) > 0
      UNION
      SELECT 
        'Loan Operations' as category,
        COUNT(DISTINCT p.role_id) as roles_with_access
      FROM permissions p
      WHERE JSON_LENGTH(p.loan_operations_access_level) > 0
      UNION
      SELECT 
        'Loan Repayment' as category,
        COUNT(DISTINCT p.role_id) as roles_with_access
      FROM permissions p
      WHERE JSON_LENGTH(p.loan_repayment_access_level) > 0
      UNION
      SELECT 
        'Group Loan' as category,
        COUNT(DISTINCT p.role_id) as roles_with_access
      FROM permissions p
      WHERE JSON_LENGTH(p.group_loan_access_level) > 0
    `);
    
    if (stats.length === 0) {
      console.log('  No permission statistics available');
    } else {
      stats.forEach(stat => {
        console.log(`  ${stat.category}: ${stat.roles_with_access} roles`);
      });
    }
    
  } catch (error) {
    console.log('⚠️ Could not fetch summary:', error.message);
  }
}

// Run the sync
runSync();