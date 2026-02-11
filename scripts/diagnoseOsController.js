// diagnoseOsController.js
import fs from 'fs';
import path from 'path';

const projectRoot = path.join(process.cwd(), '..');
const osControllerPath = path.join(projectRoot, 'src', 'controllers', 'OsController.js');

console.log('🔍 Diagnosing OsController.js...\n');

const content = fs.readFileSync(osControllerPath, 'utf8');
const lines = content.split('\n');

// Show lines around the error (line 549)
console.log('=== LINES AROUND LINE 549 ===');
for (let i = 545; i <= 555 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

// Check the processLoanOverdueAndStatus function
const functionStart = lines.findIndex(line => line.includes('export const processLoanOverdueAndStatus = async () =>'));
if (functionStart !== -1) {
  console.log('\n=== processLoanOverdueAndStatus FUNCTION ===');
  
  // Find the end of the function
  let functionEnd = functionStart;
  let braceCount = 0;
  for (let i = functionStart; i < lines.length; i++) {
    if (lines[i].includes('{')) braceCount++;
    if (lines[i].includes('}')) {
      braceCount--;
      if (braceCount === 0) {
        functionEnd = i;
        break;
      }
    }
  }
  
  // Show the function body
  for (let i = functionStart; i <= Math.min(functionEnd, functionStart + 50); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
  
  // Check for LoanAccount.findAll call
  console.log('\n=== FINDING LoanAccount.findAll CALL ===');
  for (let i = functionStart; i <= functionEnd; i++) {
    if (lines[i].includes('.findAll(') || lines[i].includes('LoanAccount.findAll')) {
      console.log(`Line ${i + 1}: ${lines[i].trim()}`);
      
      // Show context
      for (let j = Math.max(functionStart, i - 2); j <= Math.min(functionEnd, i + 2); j++) {
        console.log(`  ${j + 1}: ${lines[j]}`);
      }
      console.log('');
    }
  }
}

// Check imports
console.log('\n=== IMPORTS ===');
for (let i = 0; i < Math.min(30, lines.length); i++) {
  if (lines[i].includes('import') || lines[i].includes('require')) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

// Check for getLoanAccount import
const hasGetLoanAccountImport = lines.some(line => line.includes('getLoanAccount') && line.includes('import'));
console.log('\n✅ Has getLoanAccount import:', hasGetLoanAccountImport);

// Check for Op import
const hasOpImport = lines.some(line => line.includes('Op') && line.includes('import'));
console.log('✅ Has Op import:', hasOpImport);