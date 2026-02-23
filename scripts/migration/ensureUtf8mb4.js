// scripts/migration/ensureUtf8mb4.js
import { fileURLToPath } from 'url';  // <-- THIS WAS MISSING
import { getConnection } from '../../config/db.js';

export async function ensureDatabaseCharset() {
  console.log('🔧 Ensuring database uses utf8mb4 character set...');
  
  let connection;
  try {
    connection = await getConnection();
    
    const databaseName = process.env.DB_NAME || 'core_banking';
    
    // Check current database character set
    const [dbCharset] = await connection.query(`
      SELECT 
        DEFAULT_CHARACTER_SET_NAME,
        DEFAULT_COLLATION_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA 
      WHERE SCHEMA_NAME = ?
    `, [databaseName]);
    
    console.log('📊 Current database charset:', dbCharset[0] || 'Not found');
    
    // ... rest of your code ...
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureDatabaseCharset().catch(console.error);
}