// fixOsControllerModuleLevel.js (updated for scripts directory)
import fs from 'fs';
import path from 'path';

// Get the project root directory (one level up from scripts)
const projectRoot = path.join(process.cwd(), '..');
const osControllerPath = path.join(projectRoot, 'src', 'controllers', 'OsController.js');

console.log('Looking for OsController.js at:', osControllerPath);

// Check if file exists
if (!fs.existsSync(osControllerPath)) {
  console.error('❌ OsController.js not found at:', osControllerPath);
  console.log('Current directory:', process.cwd());
  process.exit(1);
}

let content = fs.readFileSync(osControllerPath, 'utf8');
const lines = content.split('\n');

console.log('OsController.js loaded, total lines:', lines.length);

// Find and remove the problematic module-level code
let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// Then use them') && lines[i + 1]?.includes('// Get the models properly')) {
    startIndex = i;
    console.log('Found module-level code at line:', i + 1);
    break;
  }
}

if (startIndex === -1) {
  console.log('⚠️ Module-level code not found. Looking for other patterns...');
  
  // Look for the activeLoans array initialization
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('let activeLoans = []') && 
        lines[i - 1]?.includes('const LoanRepayment =') &&
        lines[i - 2]?.includes('const LoanAccount =')) {
      startIndex = i - 2;
      console.log('Found alternative pattern at line:', startIndex + 1);
      break;
    }
  }
}

if (startIndex !== -1) {
  // Remove lines from startIndex to where the try-catch ends
  let endIndex = startIndex;
  let braceCount = 0;
  let inTryCatch = false;
  
  for (let i = startIndex; i < lines.length; i++) {
    if (lines[i].includes('try {')) {
      inTryCatch = true;
      braceCount++;
    } else if (lines[i].includes('}')) {
      braceCount--;
    }
    
    if (inTryCatch && braceCount === 0 && i > startIndex) {
      endIndex = i;
      break;
    }
    
    // Also look for the end of the block
    if (lines[i].trim() === '}' && i > startIndex + 10) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex > startIndex) {
    console.log(`Removing lines ${startIndex + 1} to ${endIndex + 1}`);
    
    // Remove the problematic lines
    lines.splice(startIndex, endIndex - startIndex + 1);
    
    // Add helper functions instead
    const helperCode = [
      '// ==================== DIRECT DEBIT LOAN REPAYMENT SERVICE ====================',
      '',
      '/**',
      ' * Helper function to get LoanAccount model',
      ' */',
      'const getLoanAccountModel = () => {',
      '  return getLoanAccount ? getLoanAccount() : null;',
      '};',
      '',
      '/**',
      ' * Helper function to get LoanRepayment model',
      ' */',
      'const getLoanRepaymentModel = () => {',
      '  return getLoanRepayment ? getLoanRepayment() : null;',
      '};',
      ''
    ];
    
    lines.splice(startIndex, 0, ...helperCode);
    
    content = lines.join('\n');
    fs.writeFileSync(osControllerPath, content, 'utf8');
    console.log('✅ Removed module-level database calls and added helper functions');
  } else {
    console.log('⚠️ Could not find end of module-level code block');
  }
} else {
  console.log('✅ No module-level database calls found (already fixed?)');
}

// Also check processLoanOverdueAndStatus function
console.log('\nChecking processLoanOverdueAndStatus function...');
const functionStart = lines.findIndex(line => line.includes('export const processLoanOverdueAndStatus = async () =>'));
if (functionStart !== -1) {
  console.log('Found processLoanOverdueAndStatus at line:', functionStart + 1);
  
  // Check if it has the model initialization
  let hasModelInit = false;
  for (let i = functionStart; i < Math.min(functionStart + 20, lines.length); i++) {
    if (lines[i].includes('const LoanAccount = getLoanAccount ? getLoanAccount()')) {
      hasModelInit = true;
      break;
    }
  }
  
  if (!hasModelInit) {
    console.log('⚠️ processLoanOverdueAndStatus needs model initialization');
  } else {
    console.log('✅ processLoanOverdueAndStatus has proper model initialization');
  }
}

console.log('\n✅ Fix script completed!');