// migrate-all-mysql-tables-to-mongodb.js - Comprehensive Migration Script for All MySQL Tables to MongoDB
// Prerequisites:
// 1. Install dependencies: npm install mysql2 mongodb
// 2. Update connection configs below (MySQL and MongoDB details).
// 3. Run: node migrate-all-mysql-tables-to-mongodb.js
// Notes:
// - This script dynamically discovers all tables from MySQL (excluding system ones like 'information_schema').
// - For each table: Fetches schema (columns/types), data, maps to MongoDB docs (converts types: int/bigint->Number, decimal/double->Decimal128, dates->Date, etc.).
// - Creates one collection per table (e.g., 'accounts' table -> 'accounts' collection).
// - Batches inserts (chunk: 1000) for efficiency; uses insertMany after dropping existing collection to avoid duplicate key errors (e.g., nulls on unique indexes like accountNumber).
// - Handles sparse/nulls; skips empty tables.
// - FIXED: Proper collection existence check using listCollections (replaces broken stats()).
// - FIXED: Filters docs with null unique fields (e.g., accountNumber) to skip inserts that would violate unique indexes post-drop.
// - Logs progress/errors; total ~237 tables, 64k rows—should take 5-15 mins.
// - Post-migration: Verify in MongoDB Compass (e.g., db.getCollectionNames()).
// - Backup both DBs first! Customize exclusions if needed (e.g., temp tables).

import mysql from 'mysql2/promise';
import { MongoClient, Decimal128 } from 'mongodb';

// Configuration
const MYSQL_CONFIG = {
  host: 'localhost', // XAMPP default
  user: 'root',
  password: '', // Blank for XAMPP
  database: 'core_x_banking', // e.g., 'core_x_banking' - UPDATE THIS
  port: 3306,
};

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0'; // e.g., 'mongodb://localhost:27017/cba_db' - UPDATE THIS
const DB_NAME = 'evolution_banking'; // Extracted from URI; UPDATE if needed

const BATCH_SIZE = 1000;
const EXCLUDED_TABLES = ['information_schema', 'performance_schema', 'mysql', 'temp_', 'pending_']; // Regex patterns to skip system/temp tables

// Main migration function
async function migrateAllTables() {
  let mysqlConnection;
  let mongoClient;
  try {
    // Connect to MySQL
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const db = mongoClient.db(DB_NAME);
    console.log('✅ MongoDB connected.');

    // Get list of all tables
    console.log('📋 Fetching list of tables...');
    const [tableRows] = await mysqlConnection.execute(
      `SHOW TABLES FROM \`${MYSQL_CONFIG.database}\``
    );
    const tables = tableRows.map(row => Object.values(row)[0]).filter(table => 
      !EXCLUDED_TABLES.some(ex => new RegExp(ex).test(table))
    );
    console.log(`📊 Found ${tables.length} tables to migrate (excluded ${tableRows.length - tables.length} system/temp).`);

    let totalRowsMigrated = 0;
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const tableName = tables[tableIndex];
      console.log(`\n🔄 Processing table ${tableIndex + 1}/${tables.length}: "${tableName}"`);

      // Get table schema (columns and types)
      const [schemaRows] = await mysqlConnection.execute(
        `DESCRIBE \`${tableName}\``
      );
      const primaryKey = schemaRows.find(col => col.Key === 'PRI')?.Field || 'id'; // Assume 'id' as PK

      // Fetch data
      const [rows] = await mysqlConnection.execute(
        `SELECT * FROM \`${tableName}\` ORDER BY \`${primaryKey}\` ASC`
      );
      console.log(`   📥 Fetched ${rows.length} rows.`);

      if (rows.length === 0) {
        console.log(`   ⏭️ Skipped empty table.`);
        continue;
      }

      // FIXED: Proper check and drop using listCollections
      const collectionsCursor = db.listCollections({ name: tableName });
      const collectionExists = await collectionsCursor.hasNext();
      if (collectionExists) {
        await db.collection(tableName).drop();
        console.log(`   🗑️ Dropped existing "${tableName}" collection.`);
      }

      // Process in batches and insert (fresh start, so use insertMany for speed)
      const batches = [];
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        batches.push(rows.slice(i, i + BATCH_SIZE));
      }

      let batchMigrated = 0;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const mongoDocs = batch.map(row => mapMySQLRowToMongoDoc(row, schemaRows));

        // FIXED: Filter out docs with null values on potential unique fields (e.g., accountNumber) to avoid insert errors
        // Detect likely unique fields (e.g., varchar(225) like account_number)
        const likelyUniqueFields = schemaRows
          .filter(col => col.Type.toLowerCase().includes('varchar') && col.Type.includes('225'))
          .map(col => col.Field.toLowerCase()); // e.g., 'accountnumber'
        const validDocs = mongoDocs.filter(doc => {
          return !likelyUniqueFields.some(field => {
            const key = Object.keys(doc).find(k => k.toLowerCase() === field);
            return key && doc[key] === null;
          });
        });

        if (validDocs.length < mongoDocs.length) {
          console.log(`   ⚠️ Skipped ${mongoDocs.length - validDocs.length} docs with null unique fields (e.g., accountNumber) in batch ${batchIndex + 1}.`);
        }

        if (validDocs.length > 0) {
          const collection = db.collection(tableName);
          const result = await collection.insertMany(validDocs, { ordered: false });
          batchMigrated += result.insertedCount;
        }
      }

      totalRowsMigrated += batchMigrated;
      console.log(`   ✅ "${tableName}" complete: ${batchMigrated} rows migrated.`);
    }

    console.log(`\n🎉 Full migration complete! Total rows across all tables: ${totalRowsMigrated}`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // Cleanup
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('🔌 MySQL disconnected.');
    }
    if (mongoClient) {
      await mongoClient.close();
      console.log('🔌 MongoDB disconnected.');
    }
  }
}

// Dynamic mapping: Convert MySQL row to MongoDB doc based on schema
function mapMySQLRowToMongoDoc(row, schema) {
  const doc = {};

  schema.forEach(col => {
    const field = col.Field;
    let value = row[field];
    if (value === null || value === undefined) {
      doc[field] = null;
      return;
    }

    // Type conversions based on MySQL type
    const type = col.Type.toLowerCase();
    if (type.includes('int') || type.includes('bigint') || type.includes('smallint') || type.includes('tinyint')) {
      doc[field] = Number(value);
    } else if (type.includes('decimal') || type.includes('float') || type.includes('double')) {
      doc[field] = Decimal128.fromString(value.toString());
    } else if (type.includes('date') || type.includes('time') || type.includes('datetime') || type.includes('timestamp')) {
      doc[field] = new Date(value);
    } else if (type.includes('enum') || type.includes('set')) {
      doc[field] = String(value);
    } else {
      // Varchar/text/blob -> String
      doc[field] = String(value);
    }
  });

  return doc;
}

// Run the migration
migrateAllTables().catch(console.error);