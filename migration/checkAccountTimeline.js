// migration/checkAccountTimeline.js
import mongoose from 'mongoose';
import '../src/models/GLAccount.js';

const connectToDatabase = async () => {
  try {
    const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkAccountTimeline = async () => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    console.log('\n📅 ACCOUNT CREATION TIMELINE');
    console.log('='.repeat(80));

    // Get accounts sorted by creation date
    const accounts = await GLAccount.find({})
      .sort({ createdAt: 1 })
      .select('_id GL_ACCT_NO ACCT_DESC createdAt systemSource');

    console.log('\nAccounts in order of creation:');
    accounts.forEach((account, index) => {
      console.log(`${index + 1}. ${account.GL_ACCT_NO} - ${account.ACCT_DESC}`);
      console.log(`   ID: ${account._id}`);
      console.log(`   Created: ${account.createdAt || 'No date'}`);
      console.log(`   Source: ${account.systemSource || 'Unknown'}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error checking timeline:', error);
  } finally {
    await mongoose.connection.close();
  }
};

checkAccountTimeline().catch(console.error);