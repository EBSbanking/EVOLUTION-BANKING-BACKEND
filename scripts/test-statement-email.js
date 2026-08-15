// scripts/test-statement-email.js
import { sendStatementEmail, generateCustomerStatement, getStatementPeriod } from '../src/utils/emailStatementService.js';
import sequelize from '../config/db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function testStatementEmail() {
  try {
    console.log('📧 Testing statement email...\n');
    
    // Get Stella's customer data
    const [customer] = await sequelize.query(
      `SELECT 
        c.*,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.CUST_ID = '0100000119'`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!customer) {
      console.log('❌ Customer not found');
      return;
    }
    
    console.log('✅ Found customer:', customer.CUST_NM);
    console.log('   Email:', customer.EMAIL_ADDRESS);
    console.log('   Alert Method:', customer.ALERT_DELIVERY_METHOD);
    console.log('   Frequency:', customer.STMNT_FREQ_CD, customer.STMNT_FREQ_VALUE);
    console.log('   Created:', customer.CREATE_DT);
    
    // Get statement period
    const today = new Date();
    const period = getStatementPeriod(customer, today);
    console.log('   Period:', period.startDateFormatted, 'to', period.endDateFormatted);
    
    // Generate statement
    console.log('\n📄 Generating statement...');
    const statementData = await generateCustomerStatement(customer, period);
    if (!statementData) {
      console.log('❌ Failed to generate statement');
      return;
    }
    console.log('✅ Statement generated');
    console.log('   Account:', statementData.customer.accountNumber);
    console.log('   Transactions:', statementData.summary.transactionCount);
    
    // Send email
    console.log('\n📧 Sending email to', customer.EMAIL_ADDRESS, '...');
    const result = await sendStatementEmail(statementData, { dryRun: false, testMode: false });
    console.log('📧 Result:', result);
    
    if (result.success) {
      console.log('✅ Email sent successfully!');
      console.log('   Message ID:', result.messageId);
    } else {
      console.log('❌ Email failed:', result.error);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testStatementEmail();