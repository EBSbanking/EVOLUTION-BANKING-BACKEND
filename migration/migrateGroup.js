// migrate-all-mysql-tables-to-mongodb-integrated.js
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

const BATCH_SIZE = 1000;
const EXCLUDED_TABLES = ['information_schema', 'performance_schema', 'mysql', 'temp_', 'pending_'];

// Global counter for legacy IDs (for groups table)
let legacyIdCounter = 1000;

// Special mapping for groups table
function mapGroupRowToMongoDoc(row, schema) {
  const groupCode = `GRP${String(row.id).padStart(3, '0')}`;
  
  const statusMap = {
    'Active': 'active',
    'Inactive': 'inactive', 
    'Dissolved': 'dissolved'
  };

  return {
    // New schema fields
    groupCode: groupCode,
    groupName: row.name,
    members: [],
    memberCount: 0,
    status: statusMap[row.status] || 'active',
    
    // Legacy fields
    legacyId: legacyIdCounter++,
    branch: row.branch,
    relationshipManager: row.relationship_manager,
    regDate: row.reg_date ? new Date(row.reg_date) : new Date(),
    minMembers: row.min_members || 0,
    maxMembers: row.max_members || 0,
    meetingDay: row.meeting_day,
    meetingFrequency: row.meeting_frequency,
    unionAddress: row.union_address,
    createdBy: row.created_by,
    offlineId: row.offline_id,
    groupType: row.group_type,
    unionPurseAccount: row.union_purse_account || 0,
    migrationId: row.migration_id,
    
    // Timestamps
    createdAt: row.reg_date ? new Date(row.reg_date) : new Date(),
    updatedAt: new Date(),
    
    // Preserve original data
    mysqlId: row.id
  };
}

// Enhanced mapping function
function mapMySQLRowToMongoDoc(row, schema, tableName) {
  // Special handling for groups table
  if (tableName.toLowerCase() === 'groups') {
    return mapGroupRowToMongoDoc(row, schema);
  }

  // Default mapping for other tables
  const doc = {};
  schema.forEach(col => {
    const field = col.Field;
    let value = row[field];
    if (value === null || value === undefined) {
      doc[field] = null;
      return;
    }

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
      doc[field] = String(value);
    }
  });

  return doc;
}

async function migrateAllTables() {
  let mysqlConnection;
  let mongoClient;
  try {
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

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
    console.log(`📊 Found ${tables.length} tables to migrate.`);

    let totalRowsMigrated = 0;
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const tableName = tables[tableIndex];
      console.log(`\n🔄 Processing table ${tableIndex + 1}/${tables.length}: "${tableName}"`);

      // Get table schema
      const [schemaRows] = await mysqlConnection.execute(
        `DESCRIBE \`${tableName}\``
      );
      const primaryKey = schemaRows.find(col => col.Key === 'PRI')?.Field || 'id';

      // Fetch data
      const [rows] = await mysqlConnection.execute(
        `SELECT * FROM \`${tableName}\` ORDER BY \`${primaryKey}\` ASC`
      );
      console.log(`   📥 Fetched ${rows.length} rows.`);

      if (rows.length === 0) {
        console.log(`   ⏭️ Skipped empty table.`);
        continue;
      }

      // Check and drop existing collection
      const collectionsCursor = db.listCollections({ name: tableName });
      const collectionExists = await collectionsCursor.hasNext();
      if (collectionExists) {
        await db.collection(tableName).drop();
        console.log(`   🗑️ Dropped existing "${tableName}" collection.`);
      }

      // Process in batches
      const batches = [];
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        batches.push(rows.slice(i, i + BATCH_SIZE));
      }

      let batchMigrated = 0;
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const mongoDocs = batch.map(row => mapMySQLRowToMongoDoc(row, schemaRows, tableName));

        // Filter out docs with null values on potential unique fields
        const likelyUniqueFields = schemaRows
          .filter(col => col.Type.toLowerCase().includes('varchar') && col.Type.includes('225'))
          .map(col => col.Field.toLowerCase());
        const validDocs = mongoDocs.filter(doc => {
          return !likelyUniqueFields.some(field => {
            const key = Object.keys(doc).find(k => k.toLowerCase() === field);
            return key && doc[key] === null;
          });
        });

        if (validDocs.length < mongoDocs.length) {
          console.log(`   ⚠️ Skipped ${mongoDocs.length - validDocs.length} docs with null unique fields in batch ${batchIndex + 1}.`);
        }

        if (validDocs.length > 0) {
          const collection = db.collection(tableName);
          const result = await collection.insertMany(validDocs, { ordered: false });
          batchMigrated += result.insertedCount;
        }
      }

      // Create special indexes for groups table
      if (tableName.toLowerCase() === 'groups' && batchMigrated > 0) {
        const collection = db.collection(tableName);
        await collection.createIndex({ groupCode: 1 }, { unique: true });
        await collection.createIndex({ legacyId: 1 }, { unique: true, sparse: true });
        await collection.createIndex({ groupName: 'text' });
        await collection.createIndex({ branch: 1 });
        await collection.createIndex({ status: 1 });
        console.log(`   🔧 Created special indexes for groups table.`);
      }

      totalRowsMigrated += batchMigrated;
      console.log(`   ✅ "${tableName}" complete: ${batchMigrated} rows migrated.`);
    }

    console.log(`\n🎉 Full migration complete! Total rows across all tables: ${totalRowsMigrated}`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
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

// Run the integrated migration
migrateAllTables().catch(console.error);