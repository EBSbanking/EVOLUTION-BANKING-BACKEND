// migration/generateUserReport.js
export const generateUserReport = async () => {
  await connectToDatabase();
  const GLAccount = mongoose.model('GLAccount');
  
  const migratedAccounts = await GLAccount.find({ systemSource: 'MIGRATED' });
  
  console.log('\n🏦 MIGRATION SUMMARY REPORT');
  console.log('='.repeat(80));
  console.log(`Migration Date: ${new Date().toLocaleDateString()}`);
  console.log(`Total Accounts Migrated: ${migratedAccounts.length}`);
  console.log('\n');
  
  // Group by account type for better reporting
  const byType = {};
  migratedAccounts.forEach(account => {
    const type = account.metadata?.accountType || 'Unknown';
    if (!byType[type]) byType[type] = [];
    
    byType[type].push({
      'Account Number': account.GL_ACCT_NO,
      'Account Name': account.ACCT_DESC,
      'Balance': `$${account.LEDGER_BALANCE?.toLocaleString() || '0'}`,
      'Status': account.REC_ST === 'A' ? 'Active' : 'Inactive',
      'Legacy ID': account.legacyReference?.legacyId || 'N/A'
    });
  });
  
  // Print organized report
  Object.entries(byType).forEach(([type, accounts]) => {
    console.log(`📊 ${type.toUpperCase()} ACCOUNTS (${accounts.length})`);
    console.log('-'.repeat(60));
    accounts.forEach(acc => {
      console.log(`  ${acc['Account Number']} - ${acc['Account Name']}`);
      console.log(`    Balance: ${acc.Balance} | Status: ${acc.Status} | Legacy: ${acc['Legacy ID']}`);
    });
    console.log('');
  });
  
  // Summary statistics
  const totalBalance = migratedAccounts.reduce((sum, acc) => sum + (acc.LEDGER_BALANCE || 0), 0);
  const activeAccounts = migratedAccounts.filter(acc => acc.REC_ST === 'A').length;
  
  console.log('📈 MIGRATION STATISTICS');
  console.log('-'.repeat(40));
  console.log(`Total Balance Migrated: $${totalBalance.toLocaleString()}`);
  console.log(`Active Accounts: ${activeAccounts}`);
  console.log(`Inactive Accounts: ${migratedAccounts.length - activeAccounts}`);
};

export default generateUserReport;