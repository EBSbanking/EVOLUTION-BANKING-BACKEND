// migration/viewMigratedAccounts.js
import mongoose from 'mongoose';
import '../models/GLAccount.js';

const connectToDatabase = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/gl_accounts_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const displayAccountsTable = async () => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    // Get all migrated accounts
    const accounts = await GLAccount.find({ systemSource: 'MIGRATED' })
      .sort({ 'legacyReference.legacyId': 1 })
      .select('-transactions -balanceHistory'); // Exclude large arrays for cleaner display

    console.log('\n📊 MIGRATED CHART OF ACCOUNTS - FULL DETAILS');
    console.log('=' .repeat(120));
    
    if (accounts.length === 0) {
      console.log('❌ No migrated accounts found');
      return;
    }

    // Display accounts in a table format
    console.log(`\nTotal Migrated Accounts: ${accounts.length}`);
    console.log('\n' + '='.repeat(180));
    console.log(
      'ID'.padEnd(25) +
      'GL ACCT NO'.padEnd(15) +
      'NAME'.padEnd(35) +
      'TYPE'.padEnd(15) +
      'BALANCE'.padEnd(12) +
      'LEVEL'.padEnd(8) +
      'PARENT'.padEnd(10) +
      'STATUS'.padEnd(10)
    );
    console.log('-'.repeat(180));

    accounts.forEach(account => {
      console.log(
        account._id.toString().padEnd(25) +
        account.GL_ACCT_NO.padEnd(15) +
        (account.ACCT_DESC || account.legacyReference?.legacyName || '').substring(0, 32).padEnd(35) +
        account.metadata.accountType.padEnd(15) +
        account.LEDGER_BALANCE.toString().padEnd(12) +
        account.level.toString().padEnd(8) +
        (account.parentCode || '-').padEnd(10) +
        account.REC_ST.padEnd(10)
      );
    });

    console.log('-'.repeat(180));

    // Show detailed view for first 5 accounts
    console.log('\n🔍 DETAILED VIEW (First 5 Accounts):');
    console.log('=' .repeat(100));
    
    const sampleAccounts = accounts.slice(0, 5);
    sampleAccounts.forEach((account, index) => {
      console.log(`\n${index + 1}. ${account.GL_ACCT_NO} - ${account.ACCT_DESC}`);
      console.log('   '.padEnd(50, '-'));
      console.log(`   MongoDB ID: ${account._id}`);
      console.log(`   GL Account No: ${account.GL_ACCT_NO}`);
      console.log(`   GL Account ID: ${account.GL_ACCT_ID}`);
      console.log(`   Description: ${account.ACCT_DESC}`);
      console.log(`   Legacy ID: ${account.legacyReference?.legacyId}`);
      console.log(`   Legacy GL Code: ${account.legacyReference?.legacyGLCode}`);
      console.log(`   Account Type: ${account.metadata.accountType}`);
      console.log(`   Category: ${account.GL_ACCT_CAT}`);
      console.log(`   Level: ${account.level}`);
      console.log(`   Parent Code: ${account.parentCode || 'None'}`);
      console.log(`   Status: ${account.REC_ST}`);
      console.log(`   Balance: ${account.LEDGER_BALANCE}`);
      console.log(`   Available Balance: ${account.AVAILABLE_BALANCE}`);
      console.log(`   Opening Balance: ${account.OPENING_BALANCE}`);
      console.log(`   Organization: ${account.organizationName} (${account.organizationCode})`);
      console.log(`   Branch: ${account.branchName} (${account.branchCode})`);
      console.log(`   System Source: ${account.systemSource}`);
      console.log(`   Created By: ${account.CREATED_BY}`);
      console.log(`   CR Allowed: ${account.CR_ALLOWED}`);
      console.log(`   DR Allowed: ${account.DR_ALLOWED}`);
      console.log(`   Post Allowed: ${account.POST_ALLOW}`);
      console.log(`   Control Account: ${account.CONTROL_ACCT_FG}`);
      console.log(`   Branch Specific: ${account.metadata.branchSpecific}`);
      console.log(`   Balance Migrated: ${account.legacyReference?.balanceMigrated}`);
    });

    // Show summary statistics
    await showMigrationSummary(accounts);

  } catch (error) {
    console.error('Error displaying accounts:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

const showMigrationSummary = async (accounts) => {
  console.log('\n📈 MIGRATION SUMMARY STATISTICS');
  console.log('=' .repeat(50));

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(acc => acc.REC_ST === 'Active').length;
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.LEDGER_BALANCE, 0);
  
  // Count by account type
  const typeCount = {};
  accounts.forEach(acc => {
    const type = acc.metadata.accountType;
    typeCount[type] = (typeCount[type] || 0) + 1;
  });

  // Count by level
  const levelCount = {};
  accounts.forEach(acc => {
    const level = acc.level;
    levelCount[level] = (levelCount[level] || 0) + 1;
  });

  console.log(`\n📊 ACCOUNT COUNTS:`);
  console.log(`   Total Accounts: ${totalAccounts}`);
  console.log(`   Active Accounts: ${activeAccounts}`);
  console.log(`   Inactive Accounts: ${totalAccounts - activeAccounts}`);
  console.log(`   Total Balance: ${totalBalance}`);

  console.log(`\n🏷️  BY ACCOUNT TYPE:`);
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`   ${type}: ${count} accounts`);
  });

  console.log(`\n📐 BY HIERARCHY LEVEL:`);
  Object.entries(levelCount).forEach(([level, count]) => {
    const levelName = level === '1' ? 'Root Groups' : 
                     level === '2' ? 'Sub-Groups' : 'Leaf Accounts';
    console.log(`   Level ${level} (${levelName}): ${count} accounts`);
  });

  // Show parent-child relationships
  const parentChildCount = {};
  accounts.forEach(acc => {
    if (acc.parentCode && acc.parentCode !== '0') {
      parentChildCount[acc.parentCode] = (parentChildCount[acc.parentCode] || 0) + 1;
    }
  });

  console.log(`\n🔗 PARENT-CHILD RELATIONSHIPS:`);
  if (Object.keys(parentChildCount).length > 0) {
    Object.entries(parentChildCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([parentId, childCount]) => {
        const parentAccount = accounts.find(acc => acc.legacyReference?.legacyId === parentId);
        const parentName = parentAccount ? parentAccount.ACCT_DESC : `Legacy ID: ${parentId}`;
        console.log(`   ${parentName}: ${childCount} child accounts`);
      });
  } else {
    console.log('   No parent-child relationships found');
  }
};

const viewAccountDetails = async (accountId) => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    const account = await GLAccount.findById(accountId);
    if (!account) {
      console.log('❌ Account not found');
      return;
    }

    console.log('\n🔍 ACCOUNT DETAILS');
    console.log('=' .repeat(80));
    console.log(JSON.stringify(account.toObject(), null, 2));

  } catch (error) {
    console.error('Error viewing account details:', error);
  } finally {
    await mongoose.connection.close();
  }
};

const viewByLegacyId = async (legacyId) => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    const account = await GLAccount.findOne({ 'legacyReference.legacyId': legacyId.toString() });
    if (!account) {
      console.log(`❌ Account with legacy ID ${legacyId} not found`);
      return;
    }

    console.log('\n🔍 ACCOUNT BY LEGACY ID');
    console.log('=' .repeat(80));
    console.log(JSON.stringify(account.toObject(), null, 2));

  } catch (error) {
    console.error('Error viewing account:', error);
  } finally {
    await mongoose.connection.close();
  }
};

// Command line interface
const main = async () => {
  const command = process.argv[2];
  const param = process.argv[3];

  switch (command) {
    case 'table':
      await displayAccountsTable();
      break;
    case 'details':
      if (!param) {
        console.log('Please provide account ID: node viewMigratedAccounts.js details <accountId>');
        return;
      }
      await viewAccountDetails(param);
      break;
    case 'legacy':
      if (!param) {
        console.log('Please provide legacy ID: node viewMigratedAccounts.js legacy <legacyId>');
        return;
      }
      await viewByLegacyId(param);
      break;
    case 'help':
    default:
      console.log(`
📋 VIEW MIGRATED ACCOUNTS TOOL
==============================

Usage: node viewMigratedAccounts.js [command] [parameter]

Commands:
  table           - Display all migrated accounts in table format
  details <id>    - Show detailed JSON for specific account by MongoDB ID
  legacy <id>     - Show detailed JSON for specific account by Legacy ID
  help            - Show this help message

Examples:
  node viewMigratedAccounts.js table
  node viewMigratedAccounts.js details 6925bfccd8bc53fb7a862770
  node viewMigratedAccounts.js legacy 365
  node viewMigratedAccounts.js help

Note: Replace <id> with actual MongoDB ObjectId or Legacy ID
      `);
      break;
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  displayAccountsTable,
  viewAccountDetails,
  viewByLegacyId
};