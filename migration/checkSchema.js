// migration/checkSchema.js
import mongoose from 'mongoose';
import '../src/models/GLAccount.js';

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

const checkSchema = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    const GLAccount = mongoose.model('GLAccount');
    
    console.log('🔍 CHECKING GLACCOUNT SCHEMA');
    console.log('============================\n');
    
    // Get schema paths
    const schemaPaths = GLAccount.schema.paths;
    
    console.log('📋 REQUIRED FIELDS:');
    Object.keys(schemaPaths).forEach(path => {
      const pathObj = schemaPaths[path];
      if (pathObj.isRequired) {
        console.log(`   ${path}:`);
        console.log(`     - Required: ${pathObj.isRequired}`);
        if (pathObj.enumValues) {
          console.log(`     - Enum values: [${pathObj.enumValues.join(', ')}]`);
        }
        if (pathObj.instance) {
          console.log(`     - Type: ${pathObj.instance}`);
        }
      }
    });
    
    console.log('\n🎯 ENUM VALUES:');
    Object.keys(schemaPaths).forEach(path => {
      const pathObj = schemaPaths[path];
      if (pathObj.enumValues && pathObj.enumValues.length > 0) {
        console.log(`   ${path}: [${pathObj.enumValues.join(', ')}]`);
      }
    });
    
    // Show sample of existing accounts to understand structure
    console.log('\n📊 EXISTING ACCOUNTS STRUCTURE:');
    const sampleAccounts = await GLAccount.find().limit(3);
    sampleAccounts.forEach((account, index) => {
      console.log(`\n   Sample Account ${index + 1}:`);
      Object.keys(account.toObject()).forEach(key => {
        if (!key.includes('_id') && !key.includes('__v')) {
          console.log(`     ${key}: ${account[key]}`);
        }
      });
    });
    
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await mongoose.connection.close();
  }
};

checkSchema().catch(console.error);