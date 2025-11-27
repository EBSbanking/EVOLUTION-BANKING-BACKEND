// migration/checkCurrentAccounts.js
import mongoose from 'mongoose';
import '../src/models/GLAccount.js';

const connectToDatabase = async () => {
  try {
    const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
    
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkCurrentAccounts = async () => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    // Use the actual ObjectIDs from your database
    const accountIds = [
      '68d531115e9298c1b7f3ba0a',
      '68d566605e9298c1b7f3bda9',
      '68d573bf5e9298c1b7f3bf43',
      '6917df07f18d9c1747651691',
      '6917f0e1e1d81a6b5d77e636',
      '6917f261e1d81a6b5d77e649',
      '6917f322e1d81a6b5d77e651',
      '6917f49be1d81a6b5d77e659',
      '6917f5b8f23d9b56174a0530',
      '69202ccee0b960b3ad502b0e',
      '6921c21f016ef23d264f5973',
      '6921c77f70fe7716afa238c5',
      '692350e770fe7716afa2402a',
      '69242e1b017407c034ba3414',
      '69249d4a1f2e5bb8dcefcfb0',
      '6924f209340d45fa0c373ee3',
      '6925b409993c2800a78ff589',
      '6925bbde87b6f17ef44d3102'
    ];

    console.log('\n🔍 CHECKING CURRENT ACCOUNTS IN EVOLUTION BANKING DATABASE');
    console.log('='.repeat(80));

    let foundCount = 0;
    for (const id of accountIds) {
      const account = await GLAccount.findById(id);
      if (account) {
        foundCount++;
        console.log(`\n✅ FOUND: ${id}`);
        console.log(`   GL Account No: ${account.GL_ACCT_NO}`);
        console.log(`   Name: ${account.ACCT_DESC}`);
        console.log(`   Type: ${account.metadata?.accountType || 'N/A'}`);
        console.log(`   Balance: ${account.LEDGER_BALANCE}`);
        console.log(`   Legacy ID: ${account.legacyReference?.legacyId || 'N/A'}`);
        console.log(`   Status: ${account.REC_ST}`);
        console.log(`   System Source: ${account.systemSource || 'N/A'}`);
      } else {
        console.log(`\n❌ NOT FOUND: ${id}`);
      }
    }

    console.log(`\n📊 Results: ${foundCount}/${accountIds.length} accounts found`);

    // Show breakdown
    const newSystemCount = await GLAccount.countDocuments({ systemSource: 'NEW_SYSTEM' });
    const migratedCount = await GLAccount.countDocuments({ systemSource: 'MIGRATED' });
    const manualCount = await GLAccount.countDocuments({ systemSource: 'MANUAL' });
    const totalCount = await GLAccount.countDocuments();
    
    console.log(`\n📊 BREAKDOWN BY SOURCE:`);
    console.log(`   New System accounts: ${newSystemCount}`);
    console.log(`   Migrated accounts: ${migratedCount}`);
    console.log(`   Manual accounts: ${manualCount}`);
    console.log(`   Total accounts: ${totalCount}`);

  } catch (error) {
    console.error('Error checking accounts:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run the check
checkCurrentAccounts().catch(console.error);