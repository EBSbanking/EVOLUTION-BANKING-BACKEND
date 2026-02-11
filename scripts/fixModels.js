// fixModels.js
import sequelize from '../config/db.js';

async function fixModels() {
  try {
    console.log('🔧 Fixing model column mappings...');
    
    // =========== FIX loan_accounts TABLE ===========
    console.log('1. Fixing loan_accounts table columns...');
    
    // First, check current column names
    const [existingColumns] = await sequelize.query(`
      SHOW COLUMNS FROM loan_accounts
    `);
    
    console.log('Current columns in loan_accounts:', existingColumns.map(col => col.Field));
    
    // Fix CUST_ID column
    const custIdColumn = existingColumns.find(col => col.Field.includes('cust') && col.Field.includes('id'));
    if (custIdColumn && custIdColumn.Field !== 'CUST_ID') {
      console.log(`Changing ${custIdColumn.Field} to CUST_ID...`);
      await sequelize.query(`
        ALTER TABLE loan_accounts 
        CHANGE COLUMN \`${custIdColumn.Field}\` CUST_ID VARCHAR(255)
      `);
    }
    
    // Fix ACCT_NO column
    const acctNoColumn = existingColumns.find(col => 
      (col.Field.includes('acc') && col.Field.includes('no')) || 
      col.Field.includes('acct_no')
    );
    if (acctNoColumn && acctNoColumn.Field !== 'ACCT_NO') {
      console.log(`Changing ${acctNoColumn.Field} to ACCT_NO...`);
      await sequelize.query(`
        ALTER TABLE loan_accounts 
        CHANGE COLUMN \`${acctNoColumn.Field}\` ACCT_NO VARCHAR(255)
      `);
    }
    
    // Fix ACCT_NM column
    const acctNmColumn = existingColumns.find(col => 
      (col.Field.includes('acc') && col.Field.includes('nm')) || 
      col.Field.includes('acct_nm')
    );
    if (acctNmColumn && acctNmColumn.Field !== 'ACCT_NM') {
      console.log(`Changing ${acctNmColumn.Field} to ACCT_NM...`);
      await sequelize.query(`
        ALTER TABLE loan_accounts 
        CHANGE COLUMN \`${acctNmColumn.Field}\` ACCT_NM VARCHAR(255)
      `);
    }
    
    // Fix other columns that might have similar issues
    const columnMappings = {
      'l_o_a_n__p_r_o_d_u_c_t__i_d': 'LOAN_PRODUCT_ID',
      'd_i_s_b_u_r_s_e_d__a_m_o_u_n_t': 'DISBURSED_AMOUNT',
      'o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l': 'OUTSTANDING_PRINCIPAL',
      'a_c_c_r_u_e_d__i_n_t_e_r_e_s_t': 'ACCRUED_INTEREST',
      'p_e_n_a_l_t_y__a_m_o_u_n_t': 'PENALTY_AMOUNT',
      'i_n_t_e_r_e_s_t__r_a_t_e': 'INTEREST_RATE',
      'l_o_a_n__s_t_a_t_u_s': 'LOAN_STATUS',
      's_e_r_v_i_c_i_n_g__s_t_a_t_u_s': 'SERVICING_STATUS',
      'a_p_p_l_i_c_a_t_i_o_n__d_a_t_e': 'APPLICATION_DATE',
      'a_p_p_r_o_v_a_l__d_a_t_e': 'APPROVAL_DATE',
      'd_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e': 'DISBURSEMENT_DATE',
      'c_l_o_s_u_r_e__d_a_t_e': 'CLOSURE_DATE',
      'l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e': 'LAST_REPAYMENT_DATE',
      'l_a_s_t__r_e_p_a_y_m_e_n_t__a_m_o_u_n_t': 'LAST_REPAYMENT_AMOUNT',
      'n_e_x_t__p_a_y_m_e_n_t__d_a_t_e': 'NEXT_PAYMENT_DATE',
      'm_a_t_u_r_i_t_y__d_t': 'MATURITY_DT',
      't_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t': 'TOTAL_REPAID_AMOUNT',
      't_e_r_m__c_d': 'TERM_CD',
      't_e_r_m__v_a_l_u_e': 'TERM_VALUE',
      'c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__i_d': 'CUSTOMER_ACCOUNT_ID'
    };
    
    for (const [oldName, newName] of Object.entries(columnMappings)) {
      const columnExists = existingColumns.find(col => col.Field === oldName);
      if (columnExists) {
        console.log(`Changing ${oldName} to ${newName}...`);
        await sequelize.query(`
          ALTER TABLE loan_accounts 
          CHANGE COLUMN \`${oldName}\` \`${newName}\` ${columnExists.Type}
        `);
      }
    }
    
    // =========== FIX loan_repayments TABLE ===========
    console.log('2. Fixing loan_repayments table columns...');
    
    // Check current columns in loan_repayments
    const [repaymentColumns] = await sequelize.query(`
      SHOW COLUMNS FROM loan_repayments
    `);
    
    console.log('Current columns in loan_repayments:', repaymentColumns.map(col => col.Field));
    
    // Add createdAt if missing
    const createdAtColumn = repaymentColumns.find(col => col.Field === 'created_at' || col.Field === 'createdAt');
    if (!createdAtColumn) {
      console.log('Adding created_at column...');
      await sequelize.query(`
        ALTER TABLE loan_repayments 
        ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      `);
    }
    
    // Add updatedAt if missing
    const updatedAtColumn = repaymentColumns.find(col => col.Field === 'updated_at' || col.Field === 'updatedAt');
    if (!updatedAtColumn) {
      console.log('Adding updated_at column...');
      await sequelize.query(`
        ALTER TABLE loan_repayments 
        ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
    }
    
    // Fix the date column issue from the error
    // The error says: "AND `LoanRepayment`.`date` <= '2026-02-09 23:19:42'"
    // But the model uses 'repayment_date' field
    const dateColumn = repaymentColumns.find(col => col.Field === 'date');
    if (dateColumn && !repaymentColumns.find(col => col.Field === 'repayment_date')) {
      console.log('Renaming date column to repayment_date...');
      await sequelize.query(`
        ALTER TABLE loan_repayments 
        CHANGE COLUMN date repayment_date DATETIME
      `);
    }
    
    console.log('✅ Model fixes applied successfully');
    
    // =========== VERIFY FIXES ===========
    console.log('3. Verifying fixes...');
    
    const [fixedLoanColumns] = await sequelize.query(`SHOW COLUMNS FROM loan_accounts`);
    const [fixedRepaymentColumns] = await sequelize.query(`SHOW COLUMNS FROM loan_repayments`);
    
    console.log('\n✅ Final loan_accounts columns:', fixedLoanColumns.map(col => col.Field));
    console.log('✅ Final loan_repayments columns:', fixedRepaymentColumns.map(col => col.Field));
    
    // Test a query
    try {
      const [testResult] = await sequelize.query(`SELECT CUST_ID, ACCT_NO FROM loan_accounts LIMIT 1`);
      console.log('\n✅ Test query successful:', testResult);
    } catch (testError) {
      console.log('\n⚠️ Test query failed:', testError.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing models:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle module vs script
if (import.meta.url === `file://${process.argv[1]}`) {
  fixModels();
}

export { fixModels };