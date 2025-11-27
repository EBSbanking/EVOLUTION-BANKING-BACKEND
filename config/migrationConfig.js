// config/migrationConfig.js
class DynamicMigrationConfig {
  constructor() {
    this.config = {
      // Default organization mapping
      organizations: {
        1001: {
          name: 'Your Organization',
          branches: {
            'MAIN': 'Main Branch'
          }
        }
      },

      // Default account type mappings
      accountTypeMappings: {
        'ASSET': 'LOAN_ASSET',
        'LIABILITY': 'LIABILITY_ACCOUNT', 
        'INCOME': 'REVENUE_ACCOUNT',
        'EXPENSE': 'EXPENSE_ACCOUNT'
      },

      // Default specific account mappings
      specificMappings: {
        'Loan Processing Fee': 'PROCESSING_FEE',
        'Admin Fee': 'OTHER_FEES',
        'Interest Income on Loan': 'INTEREST_INCOME',
        'Savings Account': 'CUSTOMER_ACCOUNT',
        'Loan Balances': 'LOAN_ASSET',
        'Daily Loan': 'LOAN_ASSET',
        'Weekly Loan': 'LOAN_ASSET',
        'Individual Loan': 'LOAN_ASSET',
        'Staff Loan': 'LOAN_ASSET',
        'Digital Fund Transfer Fee': 'OTHER_FEES',
        'BVN Validation': 'OTHER_FEES',
        'SMS Charge': 'OTHER_FEES',
        'Penalty Income': 'REVENUE_ACCOUNT',
        'Miscellaneous Income': 'REVENUE_ACCOUNT',
        'Miscellaneous Expenses': 'OPERATING_EXPENSE',
        'Savings Balances': 'DEPOSITS_LIABILITY',
        'Thrift Balances': 'DEPOSITS_LIABILITY',
        'Cash Balances': 'FIXED_ASSET',
        'Bank Balances': 'FIXED_ASSET',
        'Petty Cash': 'FIXED_ASSET',
        'Fixed Asset': 'PROPERTY_PLANT_EQUIPMENT',
        'Furniture And Fittings': 'PROPERTY_PLANT_EQUIPMENT'
      },

      // GL Code formatting rules
      glCodeFormat: {
        prefix: '',
        suffix: '',
        length: 6,
        padChar: '0',
        includeBranchCode: true
      },

      // Migration behavior settings
      behavior: {
        skipExisting: true,
        validateBeforeMigrate: true,
        createParentAccounts: true,
        preserveLegacyIds: true,
        batchSize: 50,
        maxRetries: 3
      },

      // Field mappings between legacy and new system
      fieldMappings: {
        'id': 'legacyReference.legacyId',
        'name': 'ACCT_DESC',
        'glcode': 'legacyReference.legacyGLCode',
        'type': 'GL_ACCT_CAT',
        'account_usage': 'metadata.migrationFlags.legacyAccountUsage',
        'gl_group': 'legacyReference.legacyGLGroup',
        'balance': 'LEDGER_BALANCE',
        'description': 'ACCT_DESC',
        'status': 'REC_ST'
      }
    };
  }

  // Dynamic configuration methods
  addOrganization(orgCode, orgName, branches = {}) {
    this.config.organizations[orgCode] = {
      name: orgName,
      branches: branches
    };
    return this;
  }

  addBranch(orgCode, branchCode, branchName) {
    if (this.config.organizations[orgCode]) {
      this.config.organizations[orgCode].branches[branchCode] = branchName;
    }
    return this;
  }

  addAccountTypeMapping(legacyType, newType) {
    this.config.accountTypeMappings[legacyType] = newType;
    return this;
  }

  addSpecificMapping(legacyName, metadataType) {
    this.config.specificMappings[legacyName] = metadataType;
    return this;
  }

  setGLCodeFormat(options) {
    this.config.glCodeFormat = { ...this.config.glCodeFormat, ...options };
    return this;
  }

  setBehavior(options) {
    this.config.behavior = { ...this.config.behavior, ...options };
    return this;
  }

  addFieldMapping(legacyField, newField) {
    this.config.fieldMappings[legacyField] = newField;
    return this;
  }

  // Validation methods
  validateOrganization(orgCode) {
    return !!this.config.organizations[orgCode];
  }

  validateBranch(orgCode, branchCode) {
    return this.config.organizations[orgCode]?.branches?.[branchCode];
  }

  getOrganization(orgCode) {
    return this.config.organizations[orgCode];
  }

  getBranch(orgCode, branchCode) {
    return this.config.organizations[orgCode]?.branches?.[branchCode];
  }

  mapAccountType(legacyType, accountName = '') {
    // Check specific mappings first
    if (accountName && this.config.specificMappings[accountName]) {
      return this.config.specificMappings[accountName];
    }
    
    // Fall back to type mappings
    return this.config.accountTypeMappings[legacyType] || 'LIABILITY_ACCOUNT';
  }

  generateGLAccountNo(legacyGLCode, branchCode) {
    const format = this.config.glCodeFormat;
    let cleanCode = legacyGLCode.replace(/^0+/, '');
    
    // Ensure consistent length
    if (cleanCode.length < format.length) {
      cleanCode = cleanCode.padStart(format.length, format.padChar);
    }
    
    if (format.includeBranchCode) {
      return `${branchCode}${format.prefix}${cleanCode}${format.suffix}`;
    }
    
    return `${format.prefix}${cleanCode}${format.suffix}`;
  }

  // Export current configuration
  exportConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  // Import configuration
  importConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this;
  }
}

// Default validation rules
export const VALIDATION_RULES = {
  requiredFields: ['id', 'name', 'glcode', 'type', 'account_usage'],
  allowedTypes: ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'],
  allowedUsage: ['GL Group', 'GL Account'],
  statusValues: ['Active', 'Inactive'],
  glCodePattern: /^\d+$/,
  maxNameLength: 225,
  maxDescriptionLength: 225
};

// Create default instance
const defaultConfig = new DynamicMigrationConfig();

export default defaultConfig;