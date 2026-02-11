// testModelIndex.js
console.log('Testing models/index.js...\n');

// Try different ways to import
try {
  console.log('1. Trying dynamic import...');
  const models = await import('../src/models/index.js');
  console.log('   Import successful');
  console.log('   Exports:', Object.keys(models));
  
  if (models.getLoanAccount) {
    console.log('   getLoanAccount type:', typeof models.getLoanAccount);
    const LoanAccount = models.getLoanAccount();
    console.log('   LoanAccount result:', LoanAccount);
  }
} catch (error) {
  console.log('   Import error:', error.message);
}

// Try require syntax (CommonJS)
console.log('\n2. Trying require (CommonJS)...');
try {
  const models = require('../src/models/index.js');
  console.log('   Require successful');
  console.log('   Exports:', Object.keys(models));
} catch (error) {
  console.log('   Require error:', error.message);
}