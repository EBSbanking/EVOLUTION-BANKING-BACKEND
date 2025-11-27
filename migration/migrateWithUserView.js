// migration/migrateWithUserView.js
import mongoose from 'mongoose';
import '../src/models/GLAccount.js';

const migrateWithUserView = async () => {
  await connectToDatabase();
  const GLAccount = mongoose.model('GLAccount');
  
  // Simulate migrated accounts (in real scenario, this comes from legacy data)
  const migratedAccountsData = [
    {
      GL_ACCT_NO: "01-001-100-100-001-001",
      ACCT_DESC: "Main Cash Account",
      LEDGER_BALANCE: 1500000.00,
      REC_ST: "A",
      metadata: { accountType: "Asset" },
      legacyReference: {
        legacyId: "CASH-001",
        sourceSystem: "Legacy_Core",
        migrationDate: new Date()
      }
    },
    {
      GL_ACCT_NO: "01-002-200-200-002-002", 
      ACCT_DESC: "Customer Savings",
      LEDGER_BALANCE: 5000000.00,
      REC_ST: "A",
      metadata: { accountType: "Liability" },
      legacyReference: {
        legacyId: "SAV-001",
        sourceSystem: "Legacy_Core", 
        migrationDate: new Date()
      }
    }
    // ... more accounts
  ];

  console.log('\n📋 MIGRATION RESULTS - USER VIEW');
  console.log('='.repeat(60));
  
  const results = [];
  for (const accountData of migratedAccountsData) {
    const account = new GLAccount({
      ...accountData,
      systemSource: 'MIGRATED',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await account.save();
    
    // Store user-friendly result
    results.push({
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC,
      type: account.metadata.accountType,
      balance: account.LEDGER_BALANCE,
      status: account.REC_ST === 'A' ? 'Active' : 'Inactive',
      legacyId: account.legacyReference.legacyId
    });
    
    console.log(`✅ Migrated: ${account.GL_ACCT_NO} - ${account.ACCT_DESC}`);
  }

  return results;
};

export default migrateWithUserView;