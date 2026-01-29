// models/CustomerAccount.js - UPDATED WITH DYNAMIC GL ACCOUNT CREATION
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';


class CustomerAccount extends Model {}

CustomerAccount.init(
  {
    // Primary key
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },

    // Customer reference
    customer_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        notNull: { msg: 'Customer ID is required' },
      },
      comment: 'Reference to customers table'
    },

    // ADD THIS ALIAS FIELD for compatibility with old code
    c_u_s_t__i_d: {
      type: DataTypes.BIGINT,
      field: 'customer_id', // Maps to the same database column
      allowNull: false,
      get() {
        return this.getDataValue('customer_id');
      },
      set(value) {
        this.setDataValue('customer_id', value);
      },
      comment: 'Alias for customer_id (for compatibility)'
    },

    // Product ID reference to SavingsProduct
    prod_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Reference to savings_products table (PROD_ID)'
    },

    // Account holder name
    account_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 255]
      },
      comment: 'Account holder name'
    },

    // Account identification
    account_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: {
        notNull: { msg: 'Account number is required' },
        len: [10, 20]
      },
      comment: 'Unique account number'
    },

    // GL Account references
    gl_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Reference to gl_accounts table'
    },

    gl_account_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
      comment: 'GL account number (same as account_number)'
    },

    // Product information
    product_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'SAVINGS',
      comment: 'Type of product'
    },

    product_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: '',
      comment: 'Product name'
    },

    // Product code from savings product
    product_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Product code from savings product definition'
    },

    // Branch
    branch_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 1,
      comment: 'Branch identifier'
    },

    branch_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Branch name'
    },

    // Business Unit
    bu_id: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: '001',
      comment: 'Business Unit ID'
    },

    // Status fields
    status: {
      type: DataTypes.ENUM('ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'PENDING'),
      defaultValue: 'PENDING',
      allowNull: false,
      comment: 'Account status'
    },

    account_type: {
      type: DataTypes.ENUM('SAVINGS', 'CURRENT', 'LOAN', 'FIXED_DEPOSIT'),
      defaultValue: 'SAVINGS',
      comment: 'Type of account'
    },

    product_description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'Savings Account',
      comment: 'Product description'
    },

    // Currency
    currency_code: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      comment: 'Currency code'
    },

    // ==================== MONETARY FIELDS ====================
    opening_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Initial opening balance'
    },

    current_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Current total balance'
    },

    available_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Amount available for withdrawal (includes cleared funds only)'
    },

    // ADDED: Ledger Balance
    ledger_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Book balance including all transactions (cleared + uncleared)'
    },

    // ADDED: Cleared Balance
    cleared_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Balance of fully cleared/settled funds'
    },

    // Interest fields
    interest_rate: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0.0000,
      comment: 'Interest rate'
    },

    accrued_interest: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      comment: 'Accrued interest amount'
    },

    // Flags
    is_online_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Online banking enabled'
    },

    allow_debit: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Allow debit transactions'
    },

    allow_credit: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Allow credit transactions'
    },

    // User tracking
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who created the account'
    },

    created_by_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
      comment: 'Name of user who created the account'
    },

    approved_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who approved the account'
    },

    approved_by_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
      comment: 'Name of user who approved the account'
    },

    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Approval date'
    },

    // Date fields
    last_transaction_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date of last transaction'
    },

    account_opened_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Date account was opened'
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Record creation date'
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'Record last update date'
    }
  },
  {
    sequelize,
    modelName: 'CustomerAccount',
    tableName: 'customer_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    hooks: {
      beforeCreate: (account) => {
        // Generate account number if not provided
        if (!account.account_number) {
          account.account_number = generateAccountNumber();
        }
        
        // Trim account name
        if (account.account_name) {
          account.account_name = account.account_name.trim();
        }
        
        // Ensure status is uppercase
        if (account.status) {
          account.status = account.status.toUpperCase();
        }
        
        // Ensure account_type is uppercase
        if (account.account_type) {
          account.account_type = account.account_type.toUpperCase();
        }
        
        // Set default product_description if not provided
        if (!account.product_description && account.product_type) {
          account.product_description = `${account.product_type} Account`;
        }
        
        // Set account opened date
        if (!account.account_opened_date) {
          account.account_opened_date = new Date();
        }
        
        // Initialize ALL balances if not provided
        if (!account.opening_balance) account.opening_balance = 0.00;
        if (!account.current_balance) account.current_balance = account.opening_balance;
        if (!account.available_balance) account.available_balance = account.opening_balance;
        if (!account.ledger_balance) account.ledger_balance = account.opening_balance;
        if (!account.cleared_balance) account.cleared_balance = account.opening_balance;
        
        // Set created_at timestamp
        if (!account.created_at) {
          account.created_at = new Date();
        }
        
        // Set default bu_id if not provided
        if (!account.bu_id) {
          account.bu_id = '001';
        }
        
        // Set gl_account_number to match account_number
        if (!account.gl_account_number) {
          account.gl_account_number = account.account_number;
        }
      },
      
      beforeUpdate: (account) => {
        // Update last_transaction_date on balance changes
        const fieldsToTrack = ['current_balance', 'available_balance', 'ledger_balance', 'cleared_balance'];
        const changedFields = Object.keys(account._changed || {});
        
        if (changedFields.some(field => fieldsToTrack.includes(field))) {
          account.last_transaction_date = new Date();
        }
        
        // Trim account name if changed
        if (account._changed && account._changed.account_name && account.account_name) {
          account.account_name = account.account_name.trim();
        }
        
        // Set updated_at timestamp
        account.updated_at = new Date();
      },
      
      // ==================== GL ACCOUNT SYNC HOOKS ====================
      afterCreate: async (account, options) => {
        try {
          console.log(`🔄 Auto-creating GL account for customer account: ${account.account_number}`);
          await account.createGLAccount();
        } catch (error) {
          console.error(`❌ Failed to auto-create GL account: ${error.message}`);
          // Don't throw error to prevent customer account creation from failing
        }
      },
      
      afterUpdate: async (account, options) => {
        try {
          const balanceFields = ['current_balance', 'available_balance', 'ledger_balance', 'cleared_balance'];
          const changedFields = Object.keys(account._changed || {});
          
          if (changedFields.some(field => balanceFields.includes(field))) {
            console.log(`🔄 Auto-syncing GL account balances for: ${account.account_number}`);
            await account.updateGLAccount();
          }
          
          if (account._changed && account._changed.status) {
            console.log(`🔄 Updating GL account status to: ${account.status}`);
            await account.updateGLAccountStatus();
          }
        } catch (error) {
          console.error(`❌ Failed to sync GL account: ${error.message}`);
        }
      },
      
      beforeDestroy: async (account, options) => {
        try {
          if (account.gl_account_id) {
            console.log(`🔄 Marking GL account as inactive for: ${account.account_number}`);
            await account.deactivateGLAccount();
          }
        } catch (error) {
          console.error(`❌ Failed to deactivate GL account: ${error.message}`);
        }
      }
    }
  }
);

// Helper function to generate account number
function generateAccountNumber() {
  const random9 = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return `2${random9}`;
}

// ==================== INSTANCE METHODS ====================

CustomerAccount.prototype.getAccountSummary = function() {
  return {
    id: this.id,
    customerId: this.customer_id,
    prodId: this.prod_id,
    glAccountId: this.gl_account_id,
    glAccountNumber: this.gl_account_number,
    accountName: this.account_name,
    accountNumber: this.account_number,
    productType: this.product_type,
    productName: this.product_name,
    productCode: this.product_code,
    status: this.status,
    accountType: this.account_type,
    productDescription: this.product_description,
    currency: this.currency_code,
    openingBalance: this.opening_balance,
    currentBalance: this.current_balance,
    availableBalance: this.available_balance,
    ledgerBalance: this.ledger_balance,
    clearedBalance: this.cleared_balance,
    interestRate: this.interest_rate,
    accruedInterest: this.accrued_interest,
    isOnlineEnabled: this.is_online_enabled,
    allowDebit: this.allow_debit,
    allowCredit: this.allow_credit,
    createdBy: this.created_by,
    createdByName: this.created_by_name,
    approvedBy: this.approved_by,
    approvedByName: this.approved_by_name,
    approvedAt: this.approved_at,
    lastTransactionDate: this.last_transaction_date,
    accountOpenedDate: this.account_opened_date,
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };
};

CustomerAccount.prototype.isActive = function() {
  return this.status === 'ACTIVE';
};

CustomerAccount.prototype.isPending = function() {
  return this.status === 'PENDING';
};

CustomerAccount.prototype.canDebit = function(amount) {
  return this.allow_debit && this.available_balance >= amount;
};

CustomerAccount.prototype.canCredit = function() {
  return this.allow_credit;
};

CustomerAccount.prototype.hasSufficientBalance = function(amount) {
  return this.available_balance >= amount;
};

CustomerAccount.prototype.getAllBalances = function() {
  return {
    currentBalance: this.current_balance,
    availableBalance: this.available_balance,
    ledgerBalance: this.ledger_balance,
    clearedBalance: this.cleared_balance
  };
};

CustomerAccount.prototype.getAccountHolderInfo = function() {
  return {
    accountName: this.account_name,
    accountNumber: this.account_number,
    glAccountNumber: this.gl_account_number,
    accountType: this.account_type,
    status: this.status,
    openedDate: this.account_opened_date,
    productCode: this.product_code,
    prodId: this.prod_id
  };
};

CustomerAccount.prototype.getFormattedAccountNumber = function() {
  if (this.account_number && this.account_number.length === 10) {
    return `${this.account_number.slice(0, 3)}-${this.account_number.slice(3, 7)}-${this.account_number.slice(7)}`;
  }
  return this.account_number;
};

// ==================== GL ACCOUNT DYNAMIC METHODS ====================

/**
 * Generate dynamic GL account data based on customer account
 */
CustomerAccount.prototype.generateGLAccountData = async function() {
  // Generate unique GL account ID
  const glAccountId = `GL-${this.account_number}-${Date.now()}`;
  
  // Determine account category based on account type
  const accountCategories = {
    'SAVINGS': { category_code: '2200', category_name: 'Customer Savings Deposits' },
    'CURRENT': { category_code: '2100', category_name: 'Customer Current Deposits' },
    'LOAN': { category_code: '1300', category_name: 'Customer Loans' },
    'FIXED_DEPOSIT': { category_code: '2300', category_name: 'Customer Fixed Deposits' }
  };
  
  const category = accountCategories[this.account_type] || accountCategories.SAVINGS;
  
  // Generate segment value from customer ID
  const segValue = `CUST${String(this.customer_id).padStart(6, '0')}`;
  
  return {
    g_l__a_c_c_t__n_o: this.account_number,
    g_l__a_c_c_t__i_d: glAccountId,
    c_r_e_a_t_e_d__b_y: this.created_by || 'SYSTEM_AUTO',
    coa_structure: JSON.stringify({
      structure: "4-3-2-2-3",
      segments: [
        category.category_code.slice(0, 4),
        this.branch_id?.toString().padStart(3, '0') || '001',
        this.product_code?.slice(0, 2) || '01',
        this.account_type === 'SAVINGS' ? '01' : '02',
        segValue.slice(-3)
      ]
    }),
    organization_name: this.branch_name ? `${this.branch_name} Branch` : 'Main Branch',
    organization_code: this.branch_id || 1,
    branch_name: this.branch_name || 'Main Branch',
    branch_code: this.branch_id?.toString() || '001',
    branch_type: this.branch_id === 1 ? 'MAIN' : 'SUB',
    category_code: category.category_code,
    category_name: category.category_name,
    parent_code: `${category.category_code}${this.branch_id?.toString().padStart(3, '0') || '001'}01`,
    level: 5,
    l_e_d_g_e_r__n_o: `${category.category_code}0000`,
    b_a_l__c_d: 'CR', // Liability accounts have CREDIT normal balance
    s_u_b__l_e_d_g_e_r__n_o: `${category.category_code}${this.branch_id?.toString().padStart(3, '0') || '001'}1`,
    s_e_g__n_o: 1,
    c_h_a_r_t__o_f__a_c_c_t__i_d: `CHART-${category.category_code}`,
    a_c_c_t__d_e_s_c: `${this.account_type} Account - ${this.account_name} (${this.account_number})`,
    g_l__a_c_c_t__c_a_t: 'LIABILITY',
    j_o_u_r_n_a_l__i_d: 'JNL-AUTO',
    t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: 'Customer Account',
    c_r__a_l_l_o_w_e_d: this.allow_credit ? 1 : 0,
    d_r__a_l_l_o_w_e_d: this.allow_debit ? 1 : 0,
    r_e_c__s_t: this.status === 'ACTIVE' ? 'Active' : 'Inactive',
    p_o_s_t__a_l_l_o_w: 1,
    p_o_s_t__f_g: 0,
    c_o_n_t_r_o_l__a_c_c_t__f_g: 0,
    s_u_s_p_e_n_s_e__a_c_c_t__f_g: 0,
    a_l_l_o_w__b_a_l__s_w_i_n_g__f_g: 0,
    s_e_g__v_a_l_u_e: segValue,
    s_e_g__d_e_s_c: `Customer ID: ${this.customer_id}, Account: ${this.account_name}`,
    s_e_g__t_y__c_d: 'CUSTOMER',
    s_e_g__p_l_a_c_e_h_l_d_r__i_d: 'CUSTACC',
    d_e_l_a_y__g_l__p_o_s_t_i_n_g: 0,
    l_e_d_g_e_r__b_a_l_a_n_c_e: this.ledger_balance || this.current_balance || 0,
    a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e: this.available_balance || 0,
    o_p_e_n_i_n_g__b_a_l_a_n_c_e: this.opening_balance || 0,
    c_u_r_r_e_n_t__b_a_l_a_n_c_e: this.current_balance || 0,
    c_u_r_r_e_n_c_y__c_o_d_e: this.currency_code || 'NGN',
    balance_history: JSON.stringify([{
      date: new Date().toISOString(),
      balance: this.current_balance || 0,
      type: 'INITIAL'
    }]),
    transactions: JSON.stringify([]),
    s_e_t_t_l_e_m_e_n_t__g_l__a_c_c_t__n_o: null,
    i_n_t_e_r__b_r_a_n_c_h__a_c_c_o_u_n_t: 0,
    legacy_reference: null,
    system_source: 'CUSTOMER_ACCOUNT_SYNC',
    sync_status: JSON.stringify({ 
      synced_at: new Date().toISOString(),
      source: 'customer_account',
      customer_account_id: this.id
    }),
    metadata: JSON.stringify({
      customer_id: this.customer_id,
      account_name: this.account_name,
      account_type: this.account_type,
      account_number: this.account_number,
      product_type: this.product_type,
      product_code: this.product_code,
      prod_id: this.prod_id,
      customer_account_id: this.id,
      created_at: this.created_at || new Date().toISOString(),
      auto_created: true
    }),
    branch_timezone: 'Africa/Lagos',
    created_at: this.created_at || new Date(),
    updated_at: new Date(),
    account_type: `CUSTOMER_${this.account_type}`
  };
};

/**
 * Create corresponding GL account for this customer account
 */
CustomerAccount.prototype.createGLAccount = async function() {
  try {
    // Dynamically import GLAccount model
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    // Check if GL account already exists
    const existingGLAccount = await GLAccount.findOne({
      where: { g_l__a_c_c_t__n_o: this.account_number }
    });
    
    if (existingGLAccount) {
      console.log(`✅ GL account already exists for: ${this.account_number}`);
      this.gl_account_id = existingGLAccount.id;
      this.gl_account_number = existingGLAccount.g_l__a_c_c_t__n_o;
      await this.save();
      return existingGLAccount;
    }
    
    // Generate dynamic GL account data
    const glAccountData = await this.generateGLAccountData();
    
    // Create new GL account
    const glAccount = await GLAccount.create(glAccountData);
    
    // Update customer account with GL account reference
    this.gl_account_id = glAccount.id;
    this.gl_account_number = glAccount.g_l__a_c_c_t__n_o;
    await this.save();
    
    console.log(`✅ Created GL account: ${glAccount.g_l__a_c_c_t__n_o} for customer account`);
    return glAccount;
    
  } catch (error) {
    console.error(`❌ Error creating GL account for ${this.account_number}:`, error.message);
    throw error;
  }
};

/**
 * Update GL account with current customer account balances
 */
CustomerAccount.prototype.updateGLAccount = async function() {
  try {
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    const glAccount = await GLAccount.findOne({
      where: { g_l__a_c_c_t__n_o: this.account_number }
    });
    
    if (!glAccount) {
      console.log(`⚠️ No GL account found for ${this.account_number}, creating one...`);
      return await this.createGLAccount();
    }
    
    // Get current balance history
    const balanceHistory = JSON.parse(glAccount.balance_history || '[]');
    
    // Add new balance record
    balanceHistory.push({
      date: new Date().toISOString(),
      previous_balance: glAccount.c_u_r_r_e_n_t__b_a_l_a_n_c_e,
      new_balance: this.current_balance,
      change: this.current_balance - glAccount.c_u_r_r_e_n_t__b_a_l_a_n_c_e,
      source: 'CUSTOMER_ACCOUNT_UPDATE'
    });
    
    // Keep only last 100 balance records
    const trimmedHistory = balanceHistory.slice(-100);
    
    // Update balances
    await glAccount.update({
      l_e_d_g_e_r__b_a_l_a_n_c_e: this.ledger_balance,
      a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e: this.available_balance,
      c_u_r_r_e_n_t__b_a_l_a_n_c_e: this.current_balance,
      updated_at: new Date(),
      balance_history: JSON.stringify(trimmedHistory)
    });
    
    console.log(`✅ Updated GL account balances for: ${this.account_number}`);
    return glAccount;
    
  } catch (error) {
    console.error(`❌ Error updating GL account for ${this.account_number}:`, error.message);
    throw error;
  }
};

/**
 * Update GL account status based on customer account status
 */
CustomerAccount.prototype.updateGLAccountStatus = async function() {
  try {
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    const glAccount = await GLAccount.findOne({
      where: { g_l__a_c_c_t__n_o: this.account_number }
    });
    
    if (!glAccount) return;
    
    const glStatusMap = {
      'ACTIVE': 'Active',
      'INACTIVE': 'Inactive',
      'SUSPENDED': 'Suspended',
      'CLOSED': 'Closed',
      'DORMANT': 'Inactive',
      'PENDING': 'Active'
    };
    
    await glAccount.update({
      r_e_c__s_t: glStatusMap[this.status] || 'Active',
      updated_at: new Date()
    });
    
    console.log(`✅ Updated GL account status to: ${glStatusMap[this.status]}`);
    
  } catch (error) {
    console.error(`❌ Error updating GL account status:`, error.message);
  }
};

/**
 * Deactivate GL account when customer account is closed/deleted
 */
CustomerAccount.prototype.deactivateGLAccount = async function() {
  try {
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    const glAccount = await GLAccount.findOne({
      where: { g_l__a_c_c_t__n_o: this.account_number }
    });
    
    if (!glAccount) return;
    
    await glAccount.update({
      r_e_c__s_t: 'Inactive',
      updated_at: new Date(),
      metadata: JSON.stringify({
        ...JSON.parse(glAccount.metadata || '{}'),
        deactivated_at: new Date().toISOString(),
        deactivated_reason: 'CUSTOMER_ACCOUNT_CLOSED',
        original_customer_account_id: this.id
      })
    });
    
    console.log(`✅ Deactivated GL account: ${this.account_number}`);
    
  } catch (error) {
    console.error(`❌ Error deactivating GL account:`, error.message);
  }
};

/**
 * Get associated GL account
 */
CustomerAccount.prototype.getGLAccount = async function() {
  try {
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    return await GLAccount.findOne({
      where: { g_l__a_c_c_t__n_o: this.account_number }
    });
  } catch (error) {
    console.error(`❌ Error fetching GL account:`, error.message);
    return null;
  }
};

// ==================== ASSOCIATIONS ====================

// Define associations (add this at the end of the class definition)
CustomerAccount.associate = function(models) {
  // Association with Customer model
  if (models.Customer) {
    CustomerAccount.belongsTo(models.Customer, {
      foreignKey: 'customer_id',
      as: 'customer'
    });
  }
  
  // Association with GLAccount model
  if (models.GLAccount) {
    CustomerAccount.belongsTo(models.GLAccount, {
      foreignKey: 'gl_account_id',
      as: 'glAccount',
      constraints: false // Set to false if you don't want foreign key constraint
    });
  }
  
  // Association with SavingsProduct model (if exists)
  if (models.SavingsProduct) {
    CustomerAccount.belongsTo(models.SavingsProduct, {
      foreignKey: 'prod_id',
      as: 'savingsProduct',
      constraints: false
    });
  }
};

// ==================== STATIC METHODS ====================

CustomerAccount.findByAccountNumber = async function(accountNumber) {
  return await this.findOne({
    where: { account_number: accountNumber }
  });
};

CustomerAccount.findByCustomerId = async function(customerId) {
  return await this.findAll({
    where: { customer_id: customerId },
    order: [['created_at', 'DESC']]
  });
};

CustomerAccount.findActiveAccounts = async function() {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['created_at', 'DESC']]
  });
};

CustomerAccount.findPendingAccounts = async function() {
  return await this.findAll({
    where: { status: 'PENDING' },
    order: [['created_at', 'DESC']]
  });
};

CustomerAccount.findByAccountName = async function(accountName, exact = false) {
  return await this.findAll({
    where: {
      account_name: exact ? accountName : {
        [sequelize.Op.like]: `%${accountName}%`
      }
    },
    order: [['account_name', 'ASC']]
  });
};

CustomerAccount.findByProdId = async function(prodId) {
  return await this.findAll({
    where: { prod_id: prodId },
    order: [['created_at', 'DESC']]
  });
};

CustomerAccount.findByProductCode = async function(productCode) {
  return await this.findAll({
    where: { product_code: productCode },
    order: [['created_at', 'DESC']]
  });
};

/**
 * Generate a unique account number
 */
CustomerAccount.generateAccountNumber = async function() {
  let accountNumber;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!isUnique && attempts < maxAttempts) {
    const random9 = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    accountNumber = `2${random9}`;
    
    const existing = await this.findOne({
      where: { account_number: accountNumber }
    });
    
    if (!existing) {
      isUnique = true;
    }
    
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Could not generate unique account number after multiple attempts');
  }
  
  return accountNumber;
};

/**
 * Find customer accounts by various criteria
 */
CustomerAccount.findByCriteria = async function(criteria = {}) {
  const whereClause = {};
  const Op = sequelize.Op;
  
  if (criteria.customerId) {
    whereClause.customer_id = criteria.customerId;
  }
  
  if (criteria.prodId) {
    whereClause.prod_id = criteria.prodId;
  }
  
  if (criteria.productCode) {
    whereClause.product_code = criteria.productCode;
  }
  
  if (criteria.accountName) {
    whereClause.account_name = {
      [Op.like]: `%${criteria.accountName}%`
    };
  }
  
  if (criteria.accountNumber) {
    whereClause.account_number = criteria.accountNumber;
  }
  
  if (criteria.accountType) {
    whereClause.account_type = criteria.accountType;
  }
  
  if (criteria.status) {
    whereClause.status = criteria.status;
  }
  
  if (criteria.branchId) {
    whereClause.branch_id = criteria.branchId;
  }
  
  if (criteria.buId) {
    whereClause.bu_id = criteria.buId;
  }
  
  if (criteria.minBalance) {
    whereClause.available_balance = {
      [Op.gte]: criteria.minBalance
    };
  }
  
  if (criteria.maxBalance) {
    whereClause.available_balance = {
      ...whereClause.available_balance,
      [Op.lte]: criteria.maxBalance
    };
  }

  return await this.findAll({
    where: whereClause,
    order: [['created_at', 'DESC']],
    limit: criteria.limit || 100,
    offset: criteria.offset || 0
  });
};

/**
 * Get account statistics
 */
CustomerAccount.getStatistics = async function() {
  const stats = await this.findAll({
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_accounts'],
      [sequelize.fn('COUNT', sequelize.literal("DISTINCT customer_id")), 'total_customers'],
      [sequelize.fn('COUNT', sequelize.literal("DISTINCT prod_id")), 'total_products'],
      [sequelize.fn('COUNT', sequelize.literal("DISTINCT gl_account_id")), 'total_gl_accounts'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END")), 'active_accounts'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END")), 'pending_accounts'],
      [sequelize.fn('SUM', sequelize.col('available_balance')), 'total_available_balance'],
      [sequelize.fn('SUM', sequelize.col('ledger_balance')), 'total_ledger_balance'],
      [sequelize.fn('SUM', sequelize.col('cleared_balance')), 'total_cleared_balance'],
      [sequelize.fn('AVG', sequelize.col('available_balance')), 'average_available_balance'],
      [sequelize.fn('AVG', sequelize.col('ledger_balance')), 'average_ledger_balance'],
      [sequelize.fn('MAX', sequelize.col('created_at')), 'latest_account_created']
    ]
  });
  
  return stats[0]?.dataValues || {
    total_accounts: 0,
    total_customers: 0,
    total_products: 0,
    total_gl_accounts: 0,
    active_accounts: 0,
    pending_accounts: 0,
    total_available_balance: 0,
    total_ledger_balance: 0,
    total_cleared_balance: 0,
    average_available_balance: 0,
    average_ledger_balance: 0,
    latest_account_created: null
  };
};

// ==================== GL ACCOUNT STATIC METHODS ====================

/**
 * Create missing GL accounts for all active customer accounts
 */
CustomerAccount.createMissingGLAccounts = async function() {
  try {
    console.log('🔄 Creating missing GL accounts for all active customers...');
    
    const activeAccounts = await this.findAll({
      where: { status: 'ACTIVE' }
    });
    
    let createdCount = 0;
    let updatedCount = 0;
    
    for (const account of activeAccounts) {
      try {
        const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
        
        const existingGL = await GLAccount.findOne({
          where: { g_l__a_c_c_t__n_o: account.account_number }
        });
        
        if (!existingGL) {
          await account.createGLAccount();
          createdCount++;
        } else if (!account.gl_account_id) {
          account.gl_account_id = existingGL.id;
          account.gl_account_number = existingGL.g_l__a_c_c_t__n_o;
          await account.save();
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing account ${account.account_number}:`, error.message);
      }
    }
    
    console.log(`✅ Created ${createdCount} new GL accounts, updated ${updatedCount} references`);
    return { created: createdCount, updated: updatedCount };
    
  } catch (error) {
    console.error('❌ Error creating missing GL accounts:', error.message);
    throw error;
  }
};

/**
 * Sync all customer accounts with GL accounts
 */
CustomerAccount.syncAllWithGLAccounts = async function() {
  try {
    console.log('🔄 Syncing all customer accounts with GL accounts...');
    
    const allAccounts = await this.findAll();
    
    let syncedCount = 0;
    let failedCount = 0;
    
    for (const account of allAccounts) {
      try {
        await account.updateGLAccount();
        await account.updateGLAccountStatus();
        syncedCount++;
      } catch (error) {
        console.error(`❌ Failed to sync account ${account.account_number}:`, error.message);
        failedCount++;
      }
    }
    
    console.log(`✅ Synced ${syncedCount} accounts, ${failedCount} failed`);
    return { synced: syncedCount, failed: failedCount };
    
  } catch (error) {
    console.error('❌ Error syncing all accounts:', error.message);
    throw error;
  }
};

/**
 * Get accounts without GL accounts
 */
CustomerAccount.findAccountsWithoutGL = async function() {
  try {
    const GLAccount = sequelize.models.GLAccount || (await import('./GLAccount.js')).default;
    
    const glAccounts = await GLAccount.findAll({
      attributes: ['g_l__a_c_c_t__n_o']
    });
    
    const glAccountNumbers = glAccounts.map(acc => acc.g_l__a_c_c_t__n_o);
    
    return await this.findAll({
      where: {
        account_number: {
          [sequelize.Op.notIn]: glAccountNumbers
        },
        status: 'ACTIVE'
      }
    });
    
  } catch (error) {
    console.error('❌ Error finding accounts without GL:', error.message);
    return [];
  }
};

// ==================== TABLE CREATION HELPER ====================

/**
 * Helper function to create the table if it doesn't exist
 */
CustomerAccount.createTableIfNotExists = async function() {
  try {
    const [tables] = await sequelize.query(
      "SHOW TABLES LIKE 'customer_accounts'"
    );
    
    if (tables.length === 0) {
      console.log('📦 Creating customer_accounts table...');
      
      await sequelize.query(`
        CREATE TABLE customer_accounts (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          customer_id BIGINT NOT NULL,
          prod_id INT DEFAULT NULL COMMENT 'Reference to savings_products table (PROD_ID)',
          account_name VARCHAR(255) NOT NULL COMMENT 'Account holder name',
          account_number VARCHAR(20) UNIQUE NOT NULL,
          gl_account_id INT DEFAULT NULL COMMENT 'Reference to gl_accounts table',
          gl_account_number VARCHAR(20) COMMENT 'GL account number (same as account_number)',
          product_type VARCHAR(50) DEFAULT 'SAVINGS' NOT NULL,
          product_name VARCHAR(100) DEFAULT '',
          product_code VARCHAR(50) COMMENT 'Product code from savings product definition',
          branch_id BIGINT DEFAULT 1 NOT NULL,
          branch_name VARCHAR(100),
          bu_id VARCHAR(10) DEFAULT '001' COMMENT 'Business Unit ID',
          status ENUM('ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'PENDING') DEFAULT 'PENDING' NOT NULL,
          account_type ENUM('SAVINGS', 'CURRENT', 'LOAN', 'FIXED_DEPOSIT') DEFAULT 'SAVINGS',
          product_description VARCHAR(255) DEFAULT 'Savings Account',
          currency_code VARCHAR(3) DEFAULT 'NGN',
          opening_balance DECIMAL(20,2) DEFAULT 0.00,
          current_balance DECIMAL(20,2) DEFAULT 0.00,
          available_balance DECIMAL(20,2) DEFAULT 0.00,
          ledger_balance DECIMAL(20,2) DEFAULT 0.00,
          cleared_balance DECIMAL(20,2) DEFAULT 0.00,
          interest_rate DECIMAL(10,4) DEFAULT 0.0000,
          accrued_interest DECIMAL(20,2) DEFAULT 0.00,
          is_online_enabled BOOLEAN DEFAULT TRUE,
          allow_debit BOOLEAN DEFAULT TRUE,
          allow_credit BOOLEAN DEFAULT TRUE,
          created_by VARCHAR(100),
          created_by_name VARCHAR(150),
          approved_by VARCHAR(100),
          approved_by_name VARCHAR(150),
          approved_at DATETIME,
          last_transaction_date DATETIME,
          account_opened_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          -- Indexes
          INDEX idx_customer_id (customer_id),
          INDEX idx_prod_id (prod_id),
          INDEX idx_gl_account (gl_account_id),
          INDEX idx_gl_account_number (gl_account_number),
          INDEX idx_product_code (product_code),
          INDEX idx_account_name (account_name),
          INDEX idx_account_number (account_number),
          INDEX idx_status (status),
          INDEX idx_account_type (account_type),
          INDEX idx_branch (branch_id),
          INDEX idx_bu_id (bu_id),
          INDEX idx_created_at (created_at),
          INDEX idx_account_opened_date (account_opened_date),
          INDEX idx_balances (available_balance, ledger_balance, cleared_balance)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      console.log('✅ customer_accounts table created successfully');
      return true;
    }
    
    console.log('✅ customer_accounts table already exists');
    
    // Add missing columns
    const columnsToAdd = [
      { name: 'prod_id', type: 'INT DEFAULT NULL COMMENT "Reference to savings_products table (PROD_ID)"', after: 'customer_id' },
      { name: 'account_name', type: 'VARCHAR(255) NOT NULL COMMENT "Account holder name"', after: 'prod_id' },
      { name: 'gl_account_id', type: 'INT DEFAULT NULL COMMENT "Reference to gl_accounts table"', after: 'account_number' },
      { name: 'gl_account_number', type: 'VARCHAR(20) COMMENT "GL account number (same as account_number)"', after: 'gl_account_id' },
      { name: 'product_code', type: 'VARCHAR(50) COMMENT "Product code from savings product definition"', after: 'product_name' },
      { name: 'branch_name', type: 'VARCHAR(100)', after: 'branch_id' },
      { name: 'bu_id', type: 'VARCHAR(10) DEFAULT "001" COMMENT "Business Unit ID"', after: 'branch_name' },
      { name: 'created_by_name', type: 'VARCHAR(150)', after: 'created_by' },
      { name: 'approved_by_name', type: 'VARCHAR(150)', after: 'approved_by' },
      { name: 'account_opened_date', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP', after: 'last_transaction_date' },
      { name: 'ledger_balance', type: 'DECIMAL(20,2) DEFAULT 0.00', after: 'available_balance' },
      { name: 'cleared_balance', type: 'DECIMAL(20,2) DEFAULT 0.00', after: 'ledger_balance' }
    ];
    
    for (const column of columnsToAdd) {
      try {
        await sequelize.query(`SELECT ${column.name} FROM customer_accounts LIMIT 1`);
        console.log(`✅ ${column.name} column already exists`);
      } catch (error) {
        if (error.message.includes('Unknown column')) {
          console.log(`📝 Adding missing ${column.name} column...`);
          await sequelize.query(`
            ALTER TABLE customer_accounts 
            ADD COLUMN ${column.name} ${column.type} ${column.after ? `AFTER ${column.after}` : ''}
          `);
          console.log(`✅ Added ${column.name} column`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error creating/updating customer_accounts table:', error.message);
    return false;
  }
};

export default CustomerAccount;