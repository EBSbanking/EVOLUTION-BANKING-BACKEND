// migration/completeGLAccountMigration.js
import mongoose from 'mongoose';
import GLAccount from '../src/models/GLAccount.js';

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

// Complete legacy data from your chart of accounts
const legacyAccountsData = [
  {
    id: 365, name: 'Income From Fees', glcode: '000365', type: 'INCOME', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Income From Fees', status: 'Active'
  },
  {
    id: 372, name: 'Admin Fee', glcode: '000372', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Admin Fee', status: 'Active'
  },
  {
    id: 379, name: 'Loan Processing Fee', glcode: '000379', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Loan Processing Fee', status: 'Active'
  },
  {
    id: 386, name: 'Digital Fund Transfer Fee', glcode: '000386', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Digital Fund Transfer Fee', status: 'Active'
  },
  {
    id: 393, name: 'BVN Validation', glcode: '000393', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'BVN Validation', status: 'Active'
  },
  {
    id: 400, name: 'SMS Charge', glcode: '000400', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'SMS Charge', status: 'Active'
  },
  {
    id: 407, name: 'Income From Penalties', glcode: '000407', type: 'INCOME', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Income From Penalties', status: 'Active'
  },
  {
    id: 414, name: 'Penalty Income', glcode: '000414', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '407', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Penalty Income', status: 'Active'
  },
  {
    id: 421, name: 'Direct Income', glcode: '000421', type: 'INCOME', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Direct Income', status: 'Active'
  },
  {
    id: 428, name: 'Miscellaneous Income', glcode: '000428', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '421', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Miscellaneous Income', status: 'Active'
  },
  {
    id: 435, name: 'Direct Expenses', glcode: '000435', type: 'EXPENSE', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Direct Expenses', status: 'Active'
  },
  {
    id: 442, name: 'Miscellaneous Expenses', glcode: '000442', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Miscellaneous Expenses', status: 'Active'
  },
  {
    id: 449, name: 'Savings Balances', glcode: '000449', type: 'LIABILITY', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Savings Balances', status: 'Active'
  },
  {
    id: 456, name: 'Loan Balances', glcode: '000456', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Loan Balances', status: 'Active'
  },
  {
    id: 463, name: 'Thrift Balances', glcode: '000463', type: 'LIABILITY', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Thrift Balances', status: 'Active'
  },
  {
    id: 470, name: 'Savings Account', glcode: '000470', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '449', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Savings Account', status: 'Active'
  },
  {
    id: 477, name: 'Escheated', glcode: '000477', type: 'LIABILITY', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Escheated', status: 'Active'
  },
  {
    id: 484, name: 'Write-Off', glcode: '000484', type: 'EXPENSE', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Write-Off', status: 'Active'
  },
  {
    id: 491, name: 'Escheated Savings Account', glcode: '000491', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '477', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Escheated Savings Account', status: 'Active'
  },
  {
    id: 498, name: 'Write Off Savings', glcode: '000498', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '484', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Write Off Savings', status: 'Active'
  },
  {
    id: 505, name: 'Interest Expenses on Savings', glcode: '000505', type: 'EXPENSE', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Expenses on Savings', status: 'Active'
  },
  {
    id: 512, name: 'Interest Expenses', glcode: '000512', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '505', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Expenses', status: 'Active'
  },
  {
    id: 519, name: 'Cash Balances', glcode: '000519', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Cash Balances', status: 'Active'
  },
  {
    id: 526, name: 'Petty Cash', glcode: '000526', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '519', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Petty Cash', status: 'Active'
  },
  {
    id: 533, name: 'Income From Overdraft', glcode: '000533', type: 'INCOME', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Income From Overdraft', status: 'Active'
  },
  {
    id: 540, name: 'Overdraft Income', glcode: '000540', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '533', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Overdraft Income', status: 'Active'
  },
  {
    id: 547, name: 'Fee Income', glcode: '000547', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '365', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Fee Income', status: 'Active'
  },
  {
    id: 554, name: 'Overdraft Assets', glcode: '000554', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Overdraft Assets', status: 'Active'
  },
  {
    id: 561, name: 'Overdraft Balances', glcode: '000561', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '554', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Overdraft Balances', status: 'Active'
  },
  {
    id: 568, name: 'Union Purse', glcode: '000568', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '449', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Union Purse', status: 'Active'
  },
  {
    id: 575, name: 'Staff Savings', glcode: '000575', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '449', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Staff Savings', status: 'Active'
  },
  {
    id: 582, name: 'Thrift Account', glcode: '000582', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '463', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Thrift Account', status: 'Active'
  },
  {
    id: 589, name: 'Daily Loan', glcode: '000589', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Daily Loan', status: 'Active'
  },
  {
    id: 596, name: 'Weekly Loan', glcode: '000596', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Weekly Loan', status: 'Active'
  },
  {
    id: 603, name: 'Group Monthly Loan', glcode: '000603', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Group Monthly Loan', status: 'Active'
  },
  {
    id: 610, name: 'Individual Loan', glcode: '000610', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Individual Loan', status: 'Active'
  },
  {
    id: 617, name: 'Solar Loan', glcode: '000617', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Solar Loan', status: 'Active'
  },
  {
    id: 624, name: 'Asset Loan', glcode: '000624', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Asset Loan', status: 'Active'
  },
  {
    id: 631, name: 'RapidCash', glcode: '000631', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'RapidCash', status: 'Active'
  },
  {
    id: 638, name: 'Staff Salary Advance', glcode: '000638', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Staff Salary Advance', status: 'Active'
  },
  {
    id: 645, name: 'Staff Loan', glcode: '000645', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '456', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Staff Loan', status: 'Active'
  },
  {
    id: 652, name: 'Interest Income on Loan', glcode: '000652', type: 'INCOME', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loan', status: 'Active'
  },
  {
    id: 659, name: 'Interest Income on Loans (Daily Loan)', glcode: '000659', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (Daily Loan)', status: 'Active'
  },
  {
    id: 666, name: 'Interest Income on Loans (Weekly Loan)', glcode: '000666', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Interest Income on Loans (Weekly Loan)', status: 'Active'
  },
  {
    id: 673, name: 'Interest Income on Loans (Group Monthly Loan)', glcode: '000673', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Interest Income on Loans (Group Monthly Loan)', status: 'Active'
  },
  {
    id: 680, name: 'Interest Income on Loans (Individual Loan)', glcode: '000680', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Interest Income on Loans (Individual Loan)', status: 'Active'
  },
  {
    id: 687, name: 'Interest Income on Loans (Solar Loan)', glcode: '000687', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (Solar Loan)', status: 'Active'
  },
  {
    id: 694, name: 'Interest Income on Loans (Asset Loan)', glcode: '000694', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (Asset Loan)', status: 'Active'
  },
  {
    id: 701, name: 'Interest Income on Loans (RapidCash)', glcode: '000701', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (RapidCash)', status: 'Active'
  },
  {
    id: 708, name: 'Interest Income on Loans (Staff Salary Advance)', glcode: '000708', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (Staff Salary Advance)', status: 'Active'
  },
  {
    id: 715, name: 'Interest Income on Loans (Staff Loan)', glcode: '000715', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '652', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Interest Income on Loans (Staff Loan)', status: 'Active'
  },
  {
    id: 722, name: 'Loan Impairment', glcode: '000722', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Loan Impairment', status: 'Active'
  },
  {
    id: 729, name: 'Loan Impairment Expense', glcode: '000729', type: 'EXPENSE', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Loan Impairment Expense', status: 'Active'
  },
  {
    id: 736, name: 'Loan Written Off (Impairment)', glcode: '000736', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '722', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Loan Written Off (Impairment)', status: 'Active'
  },
  {
    id: 743, name: 'Loan Written Off (Impairment Expense)', glcode: '000743', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '729', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Loan Written Off (Impairment Expense)', status: 'Active'
  },
  {
    id: 750, name: 'Bank Balances', glcode: '000750', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Bank Balances', status: 'Active'
  },
  {
    id: 757, name: 'UBA', glcode: '000757', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '750', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'UBA', status: 'Active'
  },
  {
    id: 764, name: 'Prepayment', glcode: '000764', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Prepayment', status: 'Active'
  },
  {
    id: 771, name: 'Prepaid Rent - Office', glcode: '000771', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '764', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Prepaid Rent - Office', status: 'Active'
  },
  {
    id: 778, name: 'Fixed Asset', glcode: '000778', type: 'ASSET', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Fixed Asset', status: 'Active'
  },
  {
    id: 785, name: 'Furniture And Fittings', glcode: '000785', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '778', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Furniture And Fittings', status: 'Active'
  },
  {
    id: 792, name: 'Office Maintenance', glcode: '000792', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Office Maintenance', status: 'Active'
  },
  {
    id: 799, name: 'Software License', glcode: '000799', type: 'EXPENSE', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Software License', status: 'Active'
  },
  {
    id: 806, name: 'EGIS Expenses', glcode: '000806', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '799', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'EGIS Expenses', status: 'Active'
  },
  {
    id: 813, name: 'Transport to Meeting', glcode: '000813', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Transport to Meeting', status: 'Active'
  },
  {
    id: 820, name: 'Passbook Sales', glcode: '000820', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '421', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Passbook Sales', status: 'Active'
  },
  {
    id: 827, name: 'Other Transport Expenses', glcode: '000827', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Other Transport Expenses', status: 'Active'
  },
  {
    id: 834, name: 'Generator Fuelling', glcode: '000834', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Generator Fuelling', status: 'Active'
  },
  {
    id: 841, name: 'Telephones and Email', glcode: '000841', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Telephones and Email', status: 'Active'
  },
  {
    id: 848, name: 'Manager Weekly Allowance', glcode: '000848', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Manager Weekly Allowance', status: 'Active'
  },
  {
    id: 855, name: 'Salaries and Allowances', glcode: '000855', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Salaries and Allowances', status: 'Active'
  },
  {
    id: 862, name: 'Stationery', glcode: '000862', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Stationery', status: 'Active'
  },
  {
    id: 869, name: 'Meals And Entertainment', glcode: '000869', type: 'EXPENSE', 
    account_usage: 'GL Account', gl_group: '435', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Meals And Entertainment', status: 'Active'
  },
  {
    id: 876, name: 'FIRST BANK', glcode: '000876', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '750', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'FIRST BANK', status: 'Active'
  },
  {
    id: 883, name: 'Account creation', glcode: '000883', type: 'INCOME', 
    account_usage: 'GL Account', gl_group: '421', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: '', status: 'Active'
  },
  {
    id: 890, name: 'Borrowed Fund', glcode: '000890', type: 'LIABILITY', 
    account_usage: 'GL Group', gl_group: '0', balance: 0, unreconciled_balance: 0,
    manual_entries: 'No', description: 'Borrowed Fund', status: 'Active'
  },
  {
    id: 897, name: 'Corporate Borrowings', glcode: '000897', type: 'LIABILITY', 
    account_usage: 'GL Account', gl_group: '890', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: 'Corporate Borrowings', status: 'Active'
  },
  {
    id: 904, name: 'MONIE POINT', glcode: '000904', type: 'ASSET', 
    account_usage: 'GL Account', gl_group: '750', balance: 0, unreconciled_balance: 0,
    manual_entries: 'Yes', description: '', status: 'Active'
  }
];

const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Enhanced mapping functions
const mapAccountType = (legacyType, legacyName) => {
  const name = legacyName.toLowerCase();
  
  if (legacyType === 'ASSET') {
    if (name.includes('loan')) return 'LOAN_ASSET';
    if (name.includes('cash') || name.includes('bank')) return 'CASH_ASSET';
    if (name.includes('fixed') || name.includes('furniture')) return 'FIXED_ASSET';
    if (name.includes('prepaid')) return 'PREPAID_ASSET';
    return 'FIXED_ASSET';
  }
  
  if (legacyType === 'LIABILITY') {
    if (name.includes('saving') || name.includes('deposit')) return 'DEPOSITS_LIABILITY';
    if (name.includes('borrow')) return 'BORROWINGS_LIABILITY';
    return 'LIABILITY_ACCOUNT';
  }
  
  if (legacyType === 'INCOME') {
    if (name.includes('interest')) return 'INTEREST_INCOME';
    if (name.includes('fee') || name.includes('charge')) return 'FEE_INCOME';
    if (name.includes('penalty')) return 'PENALTY_INCOME';
    return 'REVENUE_ACCOUNT';
  }
  
  if (legacyType === 'EXPENSE') {
    if (name.includes('interest')) return 'INTEREST_EXPENSE';
    if (name.includes('salary') || name.includes('allowance')) return 'STAFF_EXPENSE';
    if (name.includes('maintenance') || name.includes('transport')) return 'OPERATIONAL_EXPENSE';
    return 'EXPENSE_ACCOUNT';
  }
  
  return 'CUSTOMER_ACCOUNT';
};

const mapGLCategory = (legacyType, legacyName) => {
  const name = legacyName.toLowerCase();
  
  if (legacyType === 'ASSET') {
    if (name.includes('loan')) return '105'; // LOANS AND OVERDRAFTS TO CLIENTS
    if (name.includes('cash') || name.includes('bank')) return '101'; // CASH
    if (name.includes('fixed') || name.includes('furniture')) return '103'; // FIXED ASSETS
    return '101'; // Default to CASH
  }
  
  if (legacyType === 'LIABILITY') return '201'; // DEPOSITS
  if (legacyType === 'INCOME') return '401'; // INCOME
  if (legacyType === 'EXPENSE') return '501'; // EXPENSES
  
  return '101'; // Default to CASH
};

const mapAccountStatus = (legacyStatus) => {
  return legacyStatus === 'Active' ? 'Active' : 'Inactive';
};

const runCompleteMigration = async () => {
  try {
    await connectToDatabase();
    const GLAccount = mongoose.model('GLAccount');
    
    console.log('🚀 STARTING COMPLETE GL ACCOUNT MIGRATION');
    console.log('==========================================\n');
    
    // Clear any temporary accounts first
    await GLAccount.deleteMany({ 
      'legacyReference.sourceSystem': 'CORE_X_BANKING' 
    });
    console.log('🧹 Cleared previous migration data\n');
    
    let migratedCount = 0;
    let skippedCount = 0;
    const errors = [];
    
    for (const [index, legacyAccount] of legacyAccountsData.entries()) {
      try {
        // Check if account already exists by GL code
        const existingAccount = await GLAccount.findOne({
          GL_ACCT_NO: legacyAccount.glcode
        });
        
        if (existingAccount) {
          console.log(`⏭️ SKIPPED: ${legacyAccount.name} (GL ${legacyAccount.glcode} already exists)`);
          skippedCount++;
          continue;
        }
        
        // Determine account level and parent relationship
        const isGroupAccount = legacyAccount.account_usage === 'GL Group';
        const level = isGroupAccount ? 1 : 2;
        const parentGLCode = legacyAccount.gl_group !== '0' ? legacyAccount.gl_group : null;
        
        // Create complete account document
        const newAccount = new GLAccount({
          // Core Account Information
          GL_ACCT_NO: legacyAccount.glcode,
          GL_ACCT_ID: `GL${legacyAccount.id.toString().padStart(6, '0')}`,
          ACCT_DESC: legacyAccount.name,
          GL_ACCT_CAT: mapGLCategory(legacyAccount.type, legacyAccount.name),
          REC_ST: mapAccountStatus(legacyAccount.status),
          
          // Organization Structure
          organizationName: 'PCO BANK',
          organizationCode: 1001,
          branchName: 'HEAD OFFICE',
          branchCode: '001',
          branchType: 'MAIN',
          
          // Account Hierarchy
          level: level,
          parentGLCode: parentGLCode,
          SUB_LEDGER_NO: legacyAccount.gl_group !== '0' ? legacyAccount.gl_group.padStart(3, '0') : '000',
          LEDGER_NO: '100',
          CHART_OF_ACCT_ID: '01',
          BAL_CD: legacyAccount.type === 'ASSET' || legacyAccount.type === 'EXPENSE' ? '10' : '20',
          
          // Balances
          LEDGER_BALANCE: legacyAccount.balance,
          OPENING_BALANCE: legacyAccount.balance,
          CURRENT_BALANCE: legacyAccount.balance,
          AVAILABLE_BALANCE: legacyAccount.balance,
          CURRENCY_CODE: 'NGN',
          
          // Account Controls
          CR_ALLOWED: true,
          DR_ALLOWED: true,
          POST_ALLOW: true,
          POST_FG: false,
          CONTROL_ACCT_FG: isGroupAccount,
          SUSPENSE_ACCT_FG: false,
          ALLOW_BAL_SWING_FG: false,
          INTER_BRANCH_ACCOUNT: false,
          DELAY_GL_POSTING: false,
          
          // System Information
          systemSource: 'MIGRATED',
          branchTimezone: 'Africa/Lagos',
          CREATED_BY: 'MIGRATION_SYSTEM',
          UPDATED_BY: 'MIGRATION_SYSTEM',
          
          // Enhanced Metadata
          metadata: {
            accountType: mapAccountType(legacyAccount.type, legacyAccount.name),
            description: legacyAccount.description || legacyAccount.name,
            isOperational: legacyAccount.status === 'Active',
            allowManualEntries: legacyAccount.manual_entries === 'Yes',
            accountUsage: legacyAccount.account_usage,
            originalType: legacyAccount.type,
            
            migrationFlags: {
              requiresValidation: true,
              validationPassed: false,
              balanceValidated: legacyAccount.balance === 0,
              structureValidated: false
            },
            
            balanceSettings: {
              allowNegative: false,
              minimumBalance: 0,
              maximumBalance: 1000000000,
              autoReconcile: true
            },
            
            operationalSettings: {
              isGroupAccount: isGroupAccount,
              hasSubAccounts: isGroupAccount,
              requiresApproval: false,
              allowTransactions: !isGroupAccount
            }
          },
          
          // Segment Information
          SEG_NO: 1,
          SEG_VALUE: legacyAccount.type === 'ASSET' ? '10' : 
                    legacyAccount.type === 'LIABILITY' ? '20' :
                    legacyAccount.type === 'INCOME' ? '30' : '40',
          SEG_DESC: legacyAccount.name,
          SEG_TY_CD: legacyAccount.type === 'ASSET' ? '101' : 
                     legacyAccount.type === 'LIABILITY' ? '201' :
                     legacyAccount.type === 'INCOME' ? '301' : '401',
          
          // Category Information
          categoryCode: mapGLCategory(legacyAccount.type, legacyAccount.name),
          categoryName: getCategoryName(legacyAccount.type),
          parentCode: 1,
          
          // Transaction Information
          JOURNAL_ID: `J${Date.now()}${legacyAccount.id}`.slice(-12),
          TRANSACTION_TYPE: getTransactionType(legacyAccount.type),
          SETTLEMENT_GL_ACCT_NO: legacyAccount.glcode,
          
          // Folder Structure
          subfolderId: `F${legacyAccount.id.toString().padStart(3, '0')}`,
          folderPath: `/GL/${getCategoryName(legacyAccount.type)}/${legacyAccount.name}`,
          
          // Sync Status
          syncStatus: {
            syncRequired: false,
            syncAttempts: 0,
            lastSyncDate: null,
            balanceReconciled: legacyAccount.unreconciled_balance === 0,
            requiresManualReview: false
          },
          
          // Complete Legacy Reference
          legacyReference: {
            legacyId: legacyAccount.id.toString(),
            legacyName: legacyAccount.name,
            legacyGLCode: legacyAccount.glcode,
            legacyType: legacyAccount.type,
            legacyAccountUsage: legacyAccount.account_usage,
            legacyGLGroup: legacyAccount.gl_group,
            sourceSystem: 'CORE_X_BANKING',
            migrationDate: new Date(),
            migrationBatch: `COMPLETE_MIG_${Date.now()}`,
            
            // Store ALL original data for reference
            originalData: {
              id: legacyAccount.id,
              name: legacyAccount.name,
              glcode: legacyAccount.glcode,
              type: legacyAccount.type,
              account_usage: legacyAccount.account_usage,
              gl_group: legacyAccount.gl_group,
              balance: legacyAccount.balance,
              unreconciled_balance: legacyAccount.unreconciled_balance,
              manual_entries: legacyAccount.manual_entries,
              description: legacyAccount.description,
              status: legacyAccount.status
            },
            
            // Migration metadata
            migrationMetadata: {
              version: '2.0',
              mappingVersion: 'complete_v1',
              dataIntegrity: 'FULL',
              validationStatus: 'PENDING'
            }
          },
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date(),
          effectiveDate: new Date('2024-01-01') // Set to beginning of current year
        });
        
        await newAccount.save();
        migratedCount++;
        
        console.log(`✅ MIGRATED: ${legacyAccount.name}`);
        console.log(`   GL: ${legacyAccount.glcode} | Type: ${mapAccountType(legacyAccount.type, legacyAccount.name)} | Level: ${level}`);
        console.log(`   Balance: ${legacyAccount.balance} | Status: ${legacyAccount.status}`);
        
      } catch (error) {
        console.log(`❌ FAILED: ${legacyAccount.name}`);
        console.log(`   Error: ${error.message}`);
        errors.push({
          account: legacyAccount.name,
          glcode: legacyAccount.glcode,
          error: error.message
        });
        
        // Log detailed error for debugging
        if (error.errors) {
          Object.keys(error.errors).forEach(field => {
            console.log(`   Field error: ${field} - ${error.errors[field].message}`);
          });
        }
      }
    }
    
    // Generate comprehensive report
    console.log('\n🎉 COMPLETE MIGRATION FINISHED!');
    console.log('===============================\n');
    console.log(`📊 MIGRATION RESULTS:`);
    console.log(`   ✅ Successfully migrated: ${migratedCount}`);
    console.log(`   ⏭️ Skipped (already exists): ${skippedCount}`);
    console.log(`   ❌ Failed: ${errors.length}`);
    console.log(`   📈 Total processed: ${migratedCount + skippedCount + errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ MIGRATION ERRORS:');
      errors.forEach(err => {
        console.log(`   - ${err.account} (${err.glcode}): ${err.error}`);
      });
    }
    
    // Show detailed sample of migrated accounts
    if (migratedCount > 0) {
      const GLAccount = mongoose.model('GLAccount');
      const sampleAccounts = await GLAccount.find({ 
        'legacyReference.migrationBatch': { $regex: /COMPLETE_MIG/ } 
      })
        .limit(5)
        .select('GL_ACCT_NO ACCT_DESC GL_ACCT_CAT metadata.accountType level REC_ST LEDGER_BALANCE');
      
      console.log('\n📋 SAMPLE MIGRATED ACCOUNTS:');
      sampleAccounts.forEach(account => {
        console.log(`   ${account.GL_ACCT_NO} - ${account.ACCT_DESC}`);
        console.log(`     Category: ${account.GL_ACCT_CAT} | Type: ${account.metadata.accountType}`);
        console.log(`     Level: ${account.level} | Status: ${account.REC_ST} | Balance: ${account.LEDGER_BALANCE}`);
        console.log(`     ---`);
      });
    }
    
    // Show account type distribution
    const GLAccount = mongoose.model('GLAccount');
    const typeDistribution = await GLAccount.aggregate([
      { $match: { 'legacyReference.migrationBatch': { $regex: /COMPLETE_MIG/ } } },
      { $group: { _id: '$metadata.accountType', count: { $sum: 1 } } }
    ]);
    
    console.log('\n📈 ACCOUNT TYPE DISTRIBUTION:');
    typeDistribution.forEach(dist => {
      console.log(`   ${dist._id}: ${dist.count} accounts`);
    });
    
  } catch (error) {
    console.error('💥 Complete migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

// Helper functions
const getCategoryName = (type) => {
  const categoryMap = {
    'ASSET': 'ASSETS',
    'LIABILITY': 'LIABILITIES', 
    'INCOME': 'INCOME',
    'EXPENSE': 'EXPENSES'
  };
  return categoryMap[type] || 'ASSETS';
};

const getTransactionType = (type) => {
  const transactionMap = {
    'ASSET': 'Asset Balance',
    'LIABILITY': 'Liability Balance', 
    'INCOME': 'Income Transaction',
    'EXPENSE': 'Expense Transaction'
  };
  return transactionMap[type] || 'General Transaction';
};

// Run the complete migration
runCompleteMigration().catch(console.error);