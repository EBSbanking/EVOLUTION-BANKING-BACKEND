// migrate-mysql-to-mongodb.js - Fixed version bypassing schema validation
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';

// Configuration
const MYSQL_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'core_x_banking',
  port: 3306,
};

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'evolution_banking';

// Batch size for inserts
const BATCH_SIZE = 500;

// Main migration function
async function migrateData() {
  let mysqlConnection;
  let mongoClient;
  let mongoDb;
  
  try {
    // Connect to MySQL
    console.log('🔌 Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ MySQL connected.');

    // Connect to MongoDB directly (bypass Mongoose)
    console.log('🔌 Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
    console.log('✅ MongoDB connected.');

    // Drop the existing collection to start fresh
    console.log('🗑️ Dropping existing CustomerAccount collection...');
    try {
      await mongoDb.collection('customeraccounts').drop();
      console.log('✅ Collection dropped.');
    } catch (dropError) {
      if (dropError.codeName === 'NamespaceNotFound') {
        console.log('ℹ️ Collection does not exist, creating new one...');
      } else {
        throw dropError;
      }
    }

    // Query all data from MySQL 'accounts' table
    console.log('📥 Fetching data from MySQL `accounts` table...');
    const [rows] = await mysqlConnection.execute(
      'SELECT * FROM accounts ORDER BY id ASC'
    );
    console.log(`📊 Found ${rows.length} records.`);

    if (rows.length === 0) {
      console.log('ℹ️ No data to migrate.');
      return;
    }

    // Process in batches
    const batches = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }

    let totalMigrated = 0;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)...`);

      // Map MySQL rows to MongoDB documents
      const mongoDocs = batch.map(row => mapMySQLToMongoDirect(row));

      // Insert directly using MongoDB driver (bypasses Mongoose validation)
      try {
        const result = await mongoDb.collection('customeraccounts').insertMany(mongoDocs, { ordered: false });
        totalMigrated += result.insertedCount;
        console.log(`✅ Batch ${batchIndex + 1} complete: ${result.insertedCount} inserted.`);
      } catch (insertError) {
        if (insertError.writeErrors) {
          console.log(`⚠️ Some errors in batch ${batchIndex + 1}, inserting individually...`);
          let successfulInserts = 0;
          
          for (const doc of mongoDocs) {
            try {
              await mongoDb.collection('customeraccounts').insertOne(doc);
              successfulInserts++;
            } catch (docError) {
              // Log specific error but continue
              if (docError.code === 11000) {
                console.log(`   ⚠️ Duplicate key skipped: ${doc.account_number}`);
              } else {
                console.log(`   ❌ Insert error: ${docError.message}`);
              }
            }
          }
          totalMigrated += successfulInserts;
          console.log(`✅ Batch ${batchIndex + 1} partial complete: ${successfulInserts}/${batch.length} inserted.`);
        } else {
          throw insertError;
        }
      }
    }

    console.log(`🎉 Migration complete! Total records processed: ${totalMigrated}`);
    
    // Create indexes after migration
    console.log('📊 Creating indexes...');
    await createIndexes(mongoDb);
    console.log('✅ Indexes created.');

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

// Mapping function: Convert MySQL row to MongoDB document (direct approach)
function mapMySQLToMongoDirect(row) {
  const doc = {
    // Core Identifiers
    customer_id: row.customer_id || null,
    customer_code: row.customer_code || null,

    // Account Numbers & IDs
    account_number: row.account_number || null,
    offline_id: row.offline_id || null,

    // Product & Type
    product_type: row.product_type || null,
    product: row.product || null,

    // Branch & Managers
    branch: row.branch || null,
    secondary_branch: row.secondary_branch || null,
    primary_relationship_manager: row.primary_relationship_manager || null,
    secondary_relationship_manager: row.secondary_relationship_manager || null,

    // Amounts (store as numbers initially)
    opening_amount: row.opening_amount || 0,
    loan_amount: row.loan_amount || 0,
    plan_amount: row.plan_amount || 0,
    cleared_balance: row.cleared_balance !== undefined ? row.cleared_balance : 0,
    ledger_balance: row.ledger_balance !== undefined ? row.ledger_balance : 0,

    // Loan & Repayment
    loan_term: row.loan_term || null,
    term_type: row.term_type || null,
    repayment_date: row.repayment_date || null,
    repayment_day: row.repayment_day || null,
    payment_frequency: row.payment_frequency || null,
    plan_duration: row.plan_duration || null,
    term_duration: row.term_duration || null,
    term_duration_type: row.term_duration_type || null,

    // Interest & Rates
    agreed_interest_rate: row.agreed_interest_rate || 0,
    rollover_interest_rate: row.rollover_interest_rate || 0,
    capitalized_interest: row.capitalized_interest || 0,
    interest_capitalization_period: row.interest_capitalization_period || null,
    interest_credit_count: row.interest_credit_count || 0,

    // Linked & Beneficiary
    linked_savings_account: row.linked_savings_account || null,
    savings_id: row.savings_id || null,
    beneficiary_account_type: row.beneficiary_account_type || null,
    beneficiary_account_own: row.beneficiary_account_own || null,
    beneficiary_acc_other: row.beneficiary_acc_other || null,
    customer_old: row.customer_old || null,
    beneficiary_acc_bank: row.beneficiary_acc_bank || null,
    beneficiary_acc_number: row.beneficiary_acc_number || null,

    // Rollover & Maturity
    maturity_roll_over: row.maturity_roll_over || null,
    rollover_duration: row.rollover_duration || null,

    // Origin & DVA
    origin_of_funding: row.origin_of_funding || null,
    dva_account: row.dva_account || null,
    dva_bank: row.dva_bank || null,
    dv_account_name: row.dv_account_name || null,

    // Status
    status: row.status || 'Active',
    substatus: row.substatus || 'Active',

    // User & Approval
    created_by: row.created_by || null,
    approved_by: row.approved_by || null,
    channel: row.channel || null,

    // Disbursement
    disbursement_method: row.disbursement_method || 'Cheque',
    disbursement_account_no: row.disbursement_account_no || null,

    // Thrift & Alerts
    total_debited_thrift_fee: row.total_debited_thrift_fee || 0,
    sms_alert: row.sms_alert || 'No',
    email_alert: row.email_alert || 'No',

    // Enable & Currency
    online_enabled: row.online_enabled === 2,
    currency: row.currency || 'NGN',

    // Auto & Tier
    auto_approve: row.auto_approve === 1,
    isfirst: row.isfirst || 0,
    tier: row.tier || null,

    // Extended Fields
    ACCOUNT_TYPE: getAccountType(row.product_type),
    PRODUCT_DESC: row.product || 'Default Product',
    REC_ST: row.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
    INTEREST_RATE: row.agreed_interest_rate || 0,
    ACCRUED_INTEREST: 0,
    LAST_INTEREST_DATE: row.last_interest_accrual_date ? new Date(row.last_interest_accrual_date) : new Date(),
    lastActivityDate: row.last_updated ? new Date(row.last_updated) : new Date(),
    DR_ALLOWED: true,
    CR_ALLOWED: true,
    isOverdraftAllowed: getAccountType(row.product_type) === 'CURRENT',
    overdraftLimit: 0,
    productCode: row.product || null,
    AVAILABLE_BALANCE: row.cleared_balance !== undefined ? row.cleared_balance : 0,
    CURRENCY_COUNT: {
      OneThousandNaira: 0, FiveHundredNaira: 0, TwoHundredNaira: 0,
      OneHundredNaira: 0, FiftyNaira: 0, TwentyNaira: 0,
      TenNaira: 0, FiveNaira: 0, TOTAL_CURRENCY_COUNT: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Add dates
  const dateFields = ['creation_date', 'last_updated', 'application_date', 'approval_date', 'planned_liquidation_date', 'last_interest_accrual_date', 'closed_date', 'creation_datetime'];
  dateFields.forEach(field => {
    if (row[field]) {
      doc[field] = new Date(row[field]);
    }
  });

  return doc;
}

// Helper function to determine account type
function getAccountType(productType) {
  if (!productType) return 'SAVINGS';
  const type = productType.toUpperCase();
  if (type.includes('SAVINGS')) return 'SAVINGS';
  if (type.includes('CURRENT')) return 'CURRENT';
  if (type.includes('LOAN')) return 'LOAN';
  return 'SAVINGS';
}

// Create indexes after migration
async function createIndexes(db) {
  const collection = db.collection('customeraccounts');
  
  await collection.createIndex({ account_number: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ customer_id: 1 });
  await collection.createIndex({ status: 1 });
  await collection.createIndex({ product_type: 1 });
  await collection.createIndex({ branch: 1 });
  await collection.createIndex({ last_updated: -1 });
  
  console.log('   ✅ Indexes created successfully');
}

// Run the migration
migrateData().catch(console.error);