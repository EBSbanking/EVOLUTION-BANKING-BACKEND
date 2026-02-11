// fixProcessLoanFunction.js
import fs from 'fs';
import path from 'path';

const projectRoot = path.join(process.cwd(), '..');
const osControllerPath = path.join(projectRoot, 'src', 'controllers', 'OsController.js');

console.log('🔧 Fixing processLoanOverdueAndStatus function...\n');

const content = fs.readFileSync(osControllerPath, 'utf8');
const lines = content.split('\n');

// Find the function
const functionStart = lines.findIndex(line => line.includes('export const processLoanOverdueAndStatus = async () =>'));
if (functionStart === -1) {
  console.error('❌ Function not found!');
  process.exit(1);
}

console.log('Function starts at line:', functionStart + 1);

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

console.log('Function ends at line:', functionEnd + 1);

// Replace the entire function with the fixed version
const fixedFunction = `export const processLoanOverdueAndStatus = async () => {
  try {
    logger.info('🔄 Processing loan overdue status...');
    
    // DEBUG: Add detailed logging
    console.log('=== DEBUG processLoanOverdueAndStatus ===');
    console.log('getLoanAccount type:', typeof getLoanAccount);
    console.log('getLoanAccount is function?:', typeof getLoanAccount === 'function');
    
    // Get the models properly inside the function
    const LoanAccount = getLoanAccount ? getLoanAccount() : null;
    
    console.log('LoanAccount result:', LoanAccount);
    console.log('LoanAccount.findAll exists?:', LoanAccount?.findAll ? 'YES' : 'NO');
    console.log('LoanAccount is class?:', typeof LoanAccount === 'function' ? 'YES' : 'NO');
    
    if (!LoanAccount || typeof LoanAccount.findAll !== 'function') {
      const errorMsg = 'LoanAccount model not available or findAll not a function';
      logger.error(errorMsg, {
        loanAccountExists: !!LoanAccount,
        loanAccountType: typeof LoanAccount,
        findAllExists: LoanAccount?.findAll ? 'YES' : 'NO',
        getLoanAccountType: typeof getLoanAccount,
        getLoanAccountIsFunction: typeof getLoanAccount === 'function',
        getLoanAccountValue: getLoanAccount
      });
      
      // Return empty results but don't throw error
      return {
        success: false,
        error: errorMsg,
        results: {
          overdueLoans: { accounts: [], count: 0 },
          statusUpdates: { count: 0 }
        }
      };
    }
    
    console.log('DEBUG: Calling LoanAccount.findAll...');
    const loans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'APPROVED'] }
      },
      raw: true
    });

    console.log('DEBUG: Found', loans.length, 'loans');
    
    let updatedCount = 0;
    
    for (const loanData of loans) {
      try {
        if (!loanData || !loanData.MATURITY_DT || !loanData.ACCT_NO || !loanData.id) {
          logger.warn(\`Skipping invalid loan data:\`, { 
            hasMaturityDate: !!loanData?.MATURITY_DT,
            hasAccountNo: !!loanData?.ACCT_NO,
            hasId: !!loanData?.id 
          });
          continue;
        }

        const maturityDate = new Date(loanData.MATURITY_DT);
        const currentDate = new Date();
        
        if (isNaN(maturityDate.getTime())) {
          logger.warn(\`Invalid maturity date for loan \${loanData.ACCT_NO}: \${loanData.MATURITY_DT}\`);
          continue;
        }

        if (maturityDate < currentDate && loanData.LOAN_STATUS === 'ACTIVE') {
          await LoanAccount.update(
            { 
              LOAN_STATUS: 'OVERDUE', 
              last_updated: new Date() 
            },
            { 
              where: { id: loanData.id } 
            }
          );
          updatedCount++;
          logger.info(\`✅ Updated loan \${loanData.ACCT_NO} to OVERDUE\`);
        } else {
          logger.debug(\`Loan \${loanData.ACCT_NO} status unchanged: \${loanData.LOAN_STATUS}\`, {
            isOverdue: maturityDate < currentDate,
            currentStatus: loanData.LOAN_STATUS
          });
        }
      } catch (loanError) {
        logger.error(\`❌ Error processing loan \${loanData?.ACCT_NO || 'unknown'}:\`, {
          error: loanError.message,
          loanId: loanData?.id
        });
        continue;
      }
    }
    
    logger.info('✅ Loan status updates completed', { updatedCount });
    return {
      success: true,
      results: {
        overdueLoans: { accounts: [], count: updatedCount },
        statusUpdates: { count: updatedCount }
      }
    };
  } catch (error) {
    logger.error('❌ Failed to process loan overdue status', { error: error.message });
    throw error;
  }
};`;

// Replace the function
lines.splice(functionStart, functionEnd - functionStart + 1, fixedFunction);

fs.writeFileSync(osControllerPath, lines.join('\n'), 'utf8');
console.log('✅ Function fixed successfully!');
console.log('\n⚠️ Restart your server and run EOD again to see debug output.');