// migration/backupCurrentState.js
import mongoose from 'mongoose';
import '../src/models/GLAccount.js';

const connectToDatabase = async () => {
  const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB Atlas successfully');
};

const backupCurrentState = async () => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    const allAccounts = await GLAccount.find({});
    
    console.log('\n💾 CURRENT DATABASE BACKUP INFO:');
    console.log('='.repeat(50));
    console.log(`Total accounts: ${allAccounts.length}`);
    console.log(`Backup timestamp: ${new Date().toISOString()}`);
    
    console.log('\n📋 ACCOUNT IDs FOR REFERENCE:');
    allAccounts.forEach(account => {
      console.log(`ID: ${account._id} | GL: ${account.GL_ACCT_NO} | ${account.ACCT_DESC} | Source: ${account.systemSource || 'NOT_SET'}`);
    });

  } catch (error) {
    console.error('Error during backup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Run backup first if you want to see current state
// backupCurrentState().catch(console.error);