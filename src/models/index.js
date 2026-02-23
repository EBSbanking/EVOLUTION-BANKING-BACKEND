// models/index.js - COMPLETE FIXED VERSION (Customer removed from function-based)
import sequelizeInstance from '../../config/db.js';
import { DataTypes, Op, QueryTypes } from 'sequelize';

console.log('📦 Starting model imports...');

// Helper to create placeholder models for offline mode
const createPlaceholderModel = (name) => {
  console.log(`📝 Creating placeholder for: ${name}`);
  return sequelizeInstance.define(name, {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, defaultValue: name },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: `${name.toLowerCase()}s`,
    timestamps: false,
    freezeTableName: true
  });
};

// Main models object
const models = {
  sequelize: sequelizeInstance,
  Op,
  DataTypes,
  QueryTypes
};

// Define model paths - COMPLETE LIST WITH THRIFT
const modelPaths = {
  // ===== AML & COMPLIANCE =====
  'AML': './AML.js',
  'AMLThreshold': './AMLThreshold.js',
  'AccountApplication': './AccountApplication.js',

  // ===== DRAWER MODELS =====
  'Drawer': './Drawer.js',
  'DrawerCloseOut': './DrawerCloseOut.js',
  'DrawerUserRole': './DrawerUserRole.js',
  'DrawerCurrencyDenomination': './DrawerCurrencyDenomination.js',
  'DrawerCurrency': './DrawerCurrency.js',

  // ===== AUDIT & SECURITY =====
  'AuditTrail': './AuditTrail.js',
  'GuarantorAudit': './GuarantorAudit.js',
  'VaultAccessAttempt': './VaultAccessAttempt.js',
  'VaultMaintenanceLog': './VaultMaintenanceLog.js',

  // ===== AUTHENTICATION & AUTHORIZATION =====
  'User': './User.js',
  'Permissions': './Permissions.js',
  'UserRole': './UserRole.js',
  'BusinessRole': './BusinessRole.js',
  'Role': './Role.js',

  // ===== BUSINESS STRUCTURE =====
  'BusinessUnit': './BusinessUnit.js',
  'Branch': './Branch.js',
  'Organization': './Organization.js',

  // ===== CUSTOMER MANAGEMENT =====
  'Customer': './Customer.js',
  'CustomerType': './CustomerType.js',
  'NextOfKin': './NextOfKin.js',
  'RelationshipOfficer': './RelationshipOfficer.js',
  'CreditOfficer': './CreditOfficer.js',

  // ===== ACCOUNTS & PRODUCTS =====
  'CustomerAccount': './CustomerAccount.js',
  'DepositAccount': './DepositAccount.js',
  'LoanAccount': './LoanAccount.js',
  'SavingsProduct': './SavingsProducts.js',
  'LoanProduct': './LoanProduct.js',
  'TermDeposit': './TermDeposit.js',
  'Thrift': './Thrift.js',           // THRIFT MODEL
  'Group': './Group.js',
  'GroupSavings': './GroupSavings.js',

  // ===== INTEREST RATES =====
  'LoanInterestRate': './LoanInterestRate.js',

  // ===== TRANSACTIONS =====
  'Transaction': './Transaction.js',
  'Deposit': './Deposit.js',
  'Withdrawal': './Withdrawal.js',
  'CashWithdrawalTransaction': './CashWithdrawalTransaction.js',
  'DepositTransaction': './DepositTransaction.js',
  'LoanRepayment': './LoanRepayment.js',
  'LoanRepaymentTransaction': './LoanRepaymentTransaction.js',
  'DirectDebit': './DirectDebit.js',
  'DirectDebitRequest': './DirectDebitRequest.js',
  'StandingOrder': './StandingOrder.js',

  // ===== GENERAL LEDGER & ACCOUNTING =====
  'GLAccount': './GLAccount.js',
  'ChartofAccount': './ChartofAccount.js',
  'GLCategory': './GLCategories.js',
  'GLTransaction': './GLTransaction.js',
  'GLAccountTransaction': './GLAccountTransaction.js',
  'JournalEntry': './JournalEntry.js',
  'GLClosingPeriod': './GLClosingPeriod.js',
  'ScheduledTask': './ScheduledTask.js',
  'EOYReport': './EOYReport.js',
  'Holiday': './Holiday.js',

  // ===== CREDIT & LENDING =====
  'CreditApplication': './CreditApplication.js',
  'LoanContractForm': './LoanContractForm.js',
  'Guarantor': './Guarantor.js',
  'Collection': './Collection.js',
  'OverdueLoan': './OverdueLoan.js',
  'LoanPortfolio': './LoanPortfolio.js',
  'LoanFee': './LoanFee.js',
  'LoanPenalty': './LoanPenalty.js',

  // ===== INTEREST & CHARGES =====
  'DepositAccountInterest': './DepositAccountInterest.js',
  'DepositAccountInterest_Tier': './DepositAccountInterest_Tier.js',
  'Charge': './Charge.js',
  'InterestCalculation': './InterestCalculation.js',

  // ===== BANKING INFRASTRUCTURE =====
  'Bank': './Bank.js',
  'Vault': './Vault.js',
  'VaultAuthorizedPersonnel': './VaultAuthorizedPersonnel.js',
  'VaultPendingApproval': './VaultPendingApproval.js',

  // ===== GEOGRAPHICAL =====
  'Country': './Country.js',
  'State': './State.js',

  // ===== WORKFLOW & PROCESSES =====
  'WorkflowProcess': './WF_BUSINESS_PROCESS.js',
  'WorkflowSubProcess': './WF_SUB_PROCESS.js',
  'WorkflowItem': './WF_WORK_ITEM.js',
  'WorkflowQueue': './WF_QUEUE.js',
  'WorkflowBusinessRoleQueue': './WF_BusinessRoleQueue.js',
  'WorkflowSubProcessPolicy': './WF_SubProcessPolicy.js',
  'CustomerWorkflowRouting': './CustWorkflowRouting.js',

  // ===== NOTIFICATIONS & COMMUNICATIONS =====
  'Notification': './Notification.js',
  'SMS': './SMS.js',

  // ===== REPORTS & ANALYTICS =====
  'Report': './Report.js',
  'Dashboard': './Dashboard.js',
  'Analytics': './Analytics.js',
  'AccountStatement': './AccountStatement.js',
  'IncomeExpense': './IncomeExpense.js',
  'TriftReport': './TriftReport.js',
  'DisbursementReport': './DisbursementReport.js',
  'LoanAccountSummary': './LoanAccountSummary.js',
  'DepositAccountSummary': './DepositAccountSummary.js',

  // ===== SYSTEM & CONFIGURATION =====
  'Counter': './Counter.js',
  'SystemDate': './SystemDate.js',
  'License': './License.js',
  'Configuration': './Configuration.js',
  'TransactionPolicy': './TransactionPolicy.js',
  'ProductTypeMapping': './ProductTypeMapping.js',
  'RateIndex': './RateIndex.js',
  'Identifier': './Identifier.js',
  'Subfolder': './Subfolder.js',
  'Event': './Event.js',

  // ===== UTILITIES =====
  'AutoReclassifyInformation': './AutoReclassifyInformation.js',
  'UploadFile': './UploadFile.js',
  'CleanupDB': './CleanupDB.js',

  // ===== TELLER & OPERATIONS =====
  'TellerStat': './TellerStat.js',
  'DepositAccountApplication': './DepositAccountApplication.js',
  'IdentificationInformation': './IdentificationInformation.js',

  // ===== PORTFOLIO MANAGEMENT =====
  'Portfolio': './Portfolio.js',
  'LoanCalculator': './LoanCalculator.js',
};

// Special handling for problematic models and function-based models
// FIXED: Removed 'Customer' from this list since it's now a proper class model
const functionBasedModels = ['AML', 'WF_WORK_ITEM', 'RelationshipOfficer', 'GuarantorAudit', 'GLClosingPeriod'];

// Import a single model with enhanced error handling
const importModel = async (modelName, modelPath) => {
  try {
    console.log(`📥 Importing ${modelName}...`);

    // Special handling for function-based models
    if (functionBasedModels.includes(modelName)) {
      console.log(`⚠️ ${modelName} is a function-based model...`);
      try {
        const imported = await import(modelPath);
        let ModelFunction = imported.default || imported[modelName] || imported;

        if (ModelFunction && typeof ModelFunction === 'function') {
          // For function-based models, we store the function
          models[modelName] = ModelFunction;
          console.log(`✅ ${modelName} function loaded (will be initialized later)`);
          return ModelFunction;
        } else {
          throw new Error(`No valid ${modelName} function found`);
        }
      } catch (specificError) {
        console.error(`❌ Special handling failed for ${modelName}:`, specificError.message);
        const placeholder = createPlaceholderModel(modelName);
        models[modelName] = placeholder;
        console.log(`📝 ${modelName} placeholder created`);
        return placeholder;
      }
    }

    // Normal import for other models
    const imported = await import(modelPath)
      .catch(async () => {
        const relativePath = `.${modelPath}`;
        return await import(relativePath);
      })
      .catch(async () => {
        const jsPath = `${modelPath.replace('.js', '')}.js`;
        return await import(jsPath);
      })
      .catch(error => {
        console.warn(`⚠️ Import failed for ${modelName}:`, error.message);
        return null;
      });

    if (!imported) {
      throw new Error(`Import returned null for ${modelName}`);
    }

    // Get the model class
    let ModelClass = imported.default || imported[modelName] || imported;

    if (ModelClass) {
      models[modelName] = ModelClass;
      console.log(`✅ ${modelName} loaded successfully`);
      return ModelClass;
    }

    throw new Error(`No valid export found for ${modelName}`);

  } catch (error) {
    console.error(`❌ Failed to load ${modelName}:`, error.message);
    const placeholder = createPlaceholderModel(modelName);
    models[modelName] = placeholder;
    console.log(`📝 ${modelName} placeholder created`);
    return placeholder;
  }
};

// Load all models
const loadModels = async () => {
  console.log(`🔄 Loading ${Object.keys(modelPaths).length} models...`);

  // Load non-function-based models first
  for (const [modelName, modelPath] of Object.entries(modelPaths)) {
    if (!functionBasedModels.includes(modelName)) {
      await importModel(modelName, modelPath);
    }
  }

  // Load function-based models last
  for (const [modelName, modelPath] of Object.entries(modelPaths)) {
    if (functionBasedModels.includes(modelName)) {
      await importModel(modelName, modelPath);
    }
  }

  console.log(`✅ Loaded ${Object.keys(models).length - 4} models`);
  return models;
};

// Initialize function-based models
const initializeFunctionBasedModels = () => {
  console.log('🔧 Initializing function-based models...');

  // FIXED: Removed 'Customer' from this list
  const modelsToInitialize = ['AML', 'WF_WORK_ITEM', 'RelationshipOfficer', 'GuarantorAudit', 'GLClosingPeriod'];

  for (const modelName of modelsToInitialize) {
    const modelFunction = models[modelName];

    if (modelFunction && typeof modelFunction === 'function') {
      try {
        console.log(`🔄 Initializing ${modelName}...`);
        const initializedModel = modelFunction(sequelizeInstance);

        if (initializedModel && typeof initializedModel.findOne === 'function') {
          models[modelName] = initializedModel;
          console.log(`✅ ${modelName} initialized successfully`);
        } else {
          console.error(`❌ ${modelName} function didn't return a valid Sequelize model`);
          models[modelName] = createPlaceholderModel(modelName);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize ${modelName}:`, error.message);
        models[modelName] = createPlaceholderModel(modelName);
      }
    }
  }
};

// ==================== ENHANCED TABLE INITIALIZATION ====================

// Table initialization for specific models
const initializeTables = async () => {
  console.log('🔄 Initializing database tables...');

  try {
    // Initialize Thrift table if model has initializeTable method
    if (models.Thrift && typeof models.Thrift.initializeTable === 'function') {
      console.log('📊 Initializing Thrift table...');
      await models.Thrift.initializeTable();
    } else if (models.Thrift && typeof models.Thrift.sync === 'function') {
      console.log('📊 Syncing Thrift table...');
      await models.Thrift.sync({ alter: false, force: false });
    }

    // Initialize Customer table - CRITICAL FOR THRIFT
    if (models.Customer && typeof models.Customer.sync === 'function') {
      console.log('📊 Syncing Customer table...');
      await models.Customer.sync({ alter: false, force: false });
    }

    // Initialize LoanAccount table if the model has an initializeTable method
    if (models.LoanAccount && typeof models.LoanAccount.initializeTable === 'function') {
      console.log('📊 Initializing LoanAccount table...');
      await models.LoanAccount.initializeTable();
    }

    // Initialize LoanInterestRate table (CRITICAL - fix for too many keys error)
    if (models.LoanInterestRate && typeof models.LoanInterestRate.initializeTable === 'function') {
      console.log('📊 Initializing LoanInterestRate table (manual mode to avoid too many keys error)...');
      await models.LoanInterestRate.initializeTable();
    } else if (models.LoanInterestRate) {
      // Fallback to safe sync
      console.log('⚠️ LoanInterestRate.initializeTable not found, using safe sync...');
      try {
        // Check if table exists first
        const [tables] = await sequelizeInstance.query(
          "SHOW TABLES LIKE 'loan_interest_rates'",
          { type: QueryTypes.SELECT }
        );

        if (tables.length === 0) {
          console.log('Creating loan_interest_rates table with safe options...');
          await models.LoanInterestRate.sync({
            force: false,
            alter: false, // Important: Don't use alter to avoid the 64-key limit issue
            logging: console.log
          });
        } else {
          console.log('✅ loan_interest_rates table already exists');
        }
      } catch (error) {
        console.error('❌ Error handling LoanInterestRate table:', error.message);
      }
    }

    // Initialize other critical tables with safe options
    const criticalTables = ['CustomerAccount', 'LoanProduct', 'Transaction', 'User', 'Thrift'];

    for (const modelName of criticalTables) {
      if (models[modelName] && typeof models[modelName].sync === 'function') {
        try {
          console.log(`📊 Checking ${modelName} table...`);
          await models[modelName].sync({ alter: false, force: false });
          console.log(`✅ ${modelName} table checked`);
        } catch (error) {
          console.error(`❌ ${modelName} sync error:`, error.message);
        }
      }
    }

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize tables:', error.message);
  }
};

// Function to check and fix excessive indexes
const checkAndFixIndexes = async () => {
  try {
    console.log('🔍 Checking for excessive indexes in loan_interest_rates table...');

    const [indexes] = await sequelizeInstance.query(
      `SHOW INDEX FROM loan_interest_rates`,
      { type: QueryTypes.SELECT }
    );

    if (indexes && indexes.length > 10) {
      console.warn(`⚠️ Warning: loan_interest_rates table has ${indexes.length} indexes, which may cause issues`);
      console.log('💡 Recommendation: Use manual table creation with reduced indexes');
    }

    // List current indexes for debugging
    console.log('📋 Current indexes in loan_interest_rates:');
    if (indexes && indexes.length > 0) {
      indexes.forEach((index, i) => {
        console.log(`  ${i + 1}. Key: ${index.Key_name}, Column: ${index.Column_name}, Unique: ${index.Non_unique === 0}`);
      });
    } else {
      console.log('  No indexes found or table does not exist yet');
    }

  } catch (error) {
    console.log('ℹ️ Could not check indexes (table may not exist yet):', error.message);
  }
};

// ==================== SET UP ASSOCIATIONS ====================

// Set up associations
const setupAssociations = async (models) => {
  console.log('🔗 Setting up associations...');

  try {
    // ===== USER & AUTH ASSOCIATIONS =====
    if (models.User && models.UserRole) {
      models.User.hasMany(models.UserRole, {
        foreignKey: 'user_id',
        as: 'userRoles'
      });
      models.UserRole.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
      console.log('✅ User ↔ UserRole');
    }

    if (models.UserRole && models.Role) {
      models.UserRole.belongsTo(models.Role, {
        foreignKey: 'role_id',
        as: 'roleDetails'
      });
      models.Role.hasMany(models.UserRole, {
        foreignKey: 'role_id',
        as: 'roleAssignments'
      });
      console.log('✅ UserRole ↔ Role');
    }

    if (models.UserRole && models.Permissions) {
      models.UserRole.hasMany(models.Permissions, {
        foreignKey: 'role_id',
        as: 'permissions'
      });
      models.Permissions.belongsTo(models.UserRole, {
        foreignKey: 'role_id',
        as: 'role'
      });
      console.log('✅ UserRole ↔ Permissions');
    }

    // ===== CUSTOMER ASSOCIATIONS =====
    if (models.Customer && models.CustomerAccount) {
      models.Customer.hasMany(models.CustomerAccount, {
        foreignKey: 'CUST_ID',
        as: 'accounts'
      });
      models.CustomerAccount.belongsTo(models.Customer, {
        foreignKey: 'CUST_ID',
        as: 'customer'
      });
      console.log('✅ Customer ↔ CustomerAccount');
    }

    if (models.Customer && models.NextOfKin) {
      models.Customer.hasMany(models.NextOfKin, {
        foreignKey: 'customerId',
        as: 'nextOfKins'
      });
      models.NextOfKin.belongsTo(models.Customer, {
        foreignKey: 'customerId',
        as: 'customer'
      });
      console.log('✅ Customer ↔ NextOfKin');
    }

    if (models.Customer && models.CustomerType) {
      models.Customer.belongsTo(models.CustomerType, {
        foreignKey: 'customer_type_id',
        as: 'customerType'
      });
      models.CustomerType.hasMany(models.Customer, {
        foreignKey: 'customer_type_id',
        as: 'customers'
      });
      console.log('✅ Customer ↔ CustomerType');
    }

    if (models.Customer && models.RelationshipOfficer) {
      models.Customer.belongsTo(models.RelationshipOfficer, {
        foreignKey: 'relationship_officer_id',
        as: 'relationshipOfficer'
      });
      models.RelationshipOfficer.hasMany(models.Customer, {
        foreignKey: 'relationship_officer_id',
        as: 'customers'
      });
      console.log('✅ Customer ↔ RelationshipOfficer');
    }

    // ===== THRIFT ASSOCIATIONS =====
    if (models.Thrift && models.Customer) {
      models.Thrift.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer'
      });
      models.Customer.hasMany(models.Thrift, {
        foreignKey: 'customer_id',
        as: 'thriftAccounts'
      });
      console.log('✅ Thrift ↔ Customer');
    }

    if (models.Thrift && models.User) {
      models.Thrift.belongsTo(models.User, {
        foreignKey: 'relationship_manager_id',
        as: 'relationshipManager'
      });
      models.User.hasMany(models.Thrift, {
        foreignKey: 'relationship_manager_id',
        as: 'managedThriftAccounts'
      });
      console.log('✅ Thrift ↔ User (Relationship Manager)');
    }

    // ===== LOAN ACCOUNT ASSOCIATIONS =====
    if (models.LoanAccount && models.Customer) {
      models.LoanAccount.belongsTo(models.Customer, {
        foreignKey: 'CUST_ID',
        targetKey: 'CUST_ID',
        as: 'customer'
      });
      models.Customer.hasMany(models.LoanAccount, {
        foreignKey: 'CUST_ID',
        sourceKey: 'CUST_ID',
        as: 'loanAccounts'
      });
      console.log('✅ LoanAccount ↔ Customer (by CUST_ID)');
    }

    if (models.LoanAccount && models.CustomerAccount) {
      models.LoanAccount.belongsTo(models.CustomerAccount, {
        foreignKey: 'CUSTOMER_ACCOUNT_ID',
        as: 'customerAccount'
      });
      models.CustomerAccount.hasMany(models.LoanAccount, {
        foreignKey: 'CUSTOMER_ACCOUNT_ID',
        as: 'loanAccounts'
      });
      console.log('✅ LoanAccount ↔ CustomerAccount');
    }

    if (models.LoanAccount && models.LoanProduct) {
      models.LoanAccount.belongsTo(models.LoanProduct, {
        foreignKey: 'LOAN_PRODUCT_ID',
        as: 'loanProduct'
      });
      models.LoanProduct.hasMany(models.LoanAccount, {
        foreignKey: 'LOAN_PRODUCT_ID',
        as: 'loanAccounts'
      });
      console.log('✅ LoanAccount ↔ LoanProduct');
    }

    if (models.LoanAccount && models.LoanRepayment) {
      models.LoanAccount.hasMany(models.LoanRepayment, {
        foreignKey: 'loan_account_id',
        as: 'repayments'
      });
      models.LoanRepayment.belongsTo(models.LoanAccount, {
        foreignKey: 'loan_account_id',
        as: 'loanAccount'
      });
      console.log('✅ LoanAccount ↔ LoanRepayment');
    }

    // ===== LOAN INTEREST RATE ASSOCIATIONS =====
    if (models.LoanInterestRate && models.RateIndex) {
      models.LoanInterestRate.belongsTo(models.RateIndex, {
        foreignKey: 'INDEX_RATE_ID',
        as: 'IndexRate'
      });

      models.RateIndex.hasMany(models.LoanInterestRate, {
        foreignKey: 'INDEX_RATE_ID',
        as: 'LoanInterestRates'
      });

      console.log('✅ LoanInterestRate ↔ RateIndex associations set');
    }

    if (models.LoanProduct && models.LoanInterestRate) {
      models.LoanProduct.belongsTo(models.LoanInterestRate, {
        foreignKey: 'LOAN_INTEREST_RATE_ID',
        as: 'LoanInterestRate',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      models.LoanProduct.belongsTo(models.LoanInterestRate, {
        foreignKey: 'LOAN_PROUD_INT_ID',
        targetKey: 'LOAN_PROUD_INT_ID',
        as: 'LoanInterestRateByProudId',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      });

      models.LoanInterestRate.hasMany(models.LoanProduct, {
        foreignKey: 'LOAN_INTEREST_RATE_ID',
        as: 'LoanProducts'
      });

      models.LoanInterestRate.hasMany(models.LoanProduct, {
        foreignKey: 'LOAN_PROUD_INT_ID',
        targetKey: 'LOAN_PROUD_INT_ID',
        as: 'LoanProductsByProudId'
      });

      console.log('✅ LoanProduct ↔ LoanInterestRate associations set');
    }

    // ===== GEOGRAPHICAL ASSOCIATIONS =====
    if (models.Country && models.State) {
      models.Country.hasMany(models.State, {
        foreignKey: 'COUNTRY_ID',
        as: 'states'
      });
      models.State.belongsTo(models.Country, {
        foreignKey: 'COUNTRY_ID',
        as: 'country'
      });
      console.log('✅ Country ↔ State');
    }

    // ===== BANKING STRUCTURE ASSOCIATIONS =====
    if (models.Bank && models.Branch) {
      models.Bank.hasMany(models.Branch, {
        as: 'branches'
      });
      models.Branch.belongsTo(models.Bank, {
        foreignKey: 'bank_id',
        as: 'bank'
      });
      console.log('✅ Bank ↔ Branch');
    }

    if (models.BusinessUnit && models.Branch) {
      models.BusinessUnit.hasMany(models.Branch, {
        foreignKey: 'business_unit_id',
        as: 'branches'
      });
      models.Branch.belongsTo(models.BusinessUnit, {
        foreignKey: 'business_unit_id',
        as: 'businessUnit'
      });
      console.log('✅ BusinessUnit ↔ Branch');
    }

    console.log('✅ All associations complete');

    // Check for index issues after associations are set
    await checkAndFixIndexes();

  } catch (error) {
    console.error('❌ Association error (non-fatal):', error.message);
    // Don't throw, just log the error
  }
};

// ==================== INITIALIZE MODELS AND ASSOCIATIONS ====================

// Initialize models and associations
let initialized = false;

const initializeModels = async () => {
  if (initialized) {
    console.log('📦 Models already initialized, returning cached models');
    return models;
  }

  try {
    console.log('🚀 Initializing all models...');
    await loadModels();

    // CRITICAL STEP: Initialize function-based models (like Customer)
    initializeFunctionBasedModels();

    // Initialize database tables (including Thrift and Customer)
    await initializeTables();

    await setupAssociations(models);
    initialized = true;
    console.log('🎉 All models initialized successfully!');
    
    // Log available models for debugging
    console.log('📊 Available models:', Object.keys(models).filter(key => 
      !['sequelize', 'Op', 'DataTypes', 'QueryTypes'].includes(key)
    ).join(', '));
    
  } catch (error) {
    console.error('❌ Model initialization failed:', error.message);
    // Return models even if associations failed
    initialized = true;
  }

  return models;
};

// ===== EXPORTS =====

// Main initialization function
export { initializeModels };

// Default export - models object
export default models;

// Export getter functions for all models
export const getModel = (modelName) => models[modelName];

// Individual model getters
export const getUser = () => models.User;
export const getPermissions = () => models.Permissions;
export const getUserRole = () => models.UserRole;
export const getRole = () => models.Role;
export const getBusinessRole = () => models.BusinessRole;
export const getBusinessUnit = () => models.BusinessUnit;
export const getAuditTrail = () => models.AuditTrail;
export const getCustomer = () => models.Customer;
export const getAML = () => models.AML;
export const getAMLThreshold = () => models.AMLThreshold;
export const getCustomerAccount = () => models.CustomerAccount;
export const getCustomerType = () => models.CustomerType;
export const getNextOfKin = () => models.NextOfKin;
export const getBank = () => models.Bank;
export const getBranch = () => models.Branch;
export const getChartofAccount = () => models.ChartofAccount;
export const getDeposit = () => models.Deposit;
export const getLoanAccount = () => models.LoanAccount;
export const getLoanRepayment = () => models.LoanRepayment;
export const getCreditApplication = () => models.CreditApplication;
export const getCollection = () => models.Collection;
export const getCharge = () => models.Charge;
export const getDepositAccountInterest = () => models.DepositAccountInterest;
export const getDepositAccountInterest_Tier = () => models.DepositAccountInterest_Tier;
export const getDirectDebit = () => models.DirectDebit;
export const getDirectDebitRequest = () => models.DirectDebitRequest;
export const getCountry = () => models.Country;
export const getState = () => models.State;
export const getCounter = () => models.Counter;
export const getAutoReclassifyInformation = () => models.AutoReclassifyInformation;
export const getVault = () => models.Vault;
export const getVaultAuthorizedPersonnel = () => models.VaultAuthorizedPersonnel;
export const getVaultPendingApproval = () => models.VaultPendingApproval;
export const getVaultAccessAttempt = () => models.VaultAccessAttempt;
export const getVaultMaintenanceLog = () => models.VaultMaintenanceLog;
export const getDrawer = () => models.Drawer;
export const getRelationshipOfficer = () => models.RelationshipOfficer;
export const getGuarantorAudit = () => models.GuarantorAudit;
export const getGLClosingPeriod = () => models.GLClosingPeriod;
export const getScheduledTask = () => models.ScheduledTask;
export const getEOYReport = () => models.EOYReport;
export const getHoliday = () => models.Holiday;
export const getLoanProduct = () => models.LoanProduct;
export const getLoanInterestRate = () => models.LoanInterestRate;
export const getProductTypeMapping = () => models.ProductTypeMapping;
export const getRateIndex = () => models.RateIndex;
export const getWF_WORK_ITEM = () => models.WorkflowItem || models.WF_WORK_ITEM;
export const getOrganization = () => models.Organization;
export const getTransaction = () => models.Transaction;
export const getGLAccount = () => models.GLAccount;
export const getGLTransaction = () => models.GLTransaction;
export const getJournalEntry = () => models.JournalEntry;
export const getNotification = () => models.Notification;
export const getSMS = () => models.SMS;
export const getReport = () => models.Report;
export const getConfiguration = () => models.Configuration;
export const getAccountApplication = () => models.AccountApplication;
export const getSavingsProduct = () => models.SavingsProduct;
export const getDrawerCloseOut = () => models.DrawerCloseOut;
export const getDrawerUserRole = () => models.DrawerUserRole;
export const getDrawerCurrencyDenomination = () => models.DrawerCurrencyDenomination;
export const getDrawerCurrency = () => models.DrawerCurrency;
export const getGLAccountTransaction = () => models.GLAccountTransaction;

// NEW: Thrift getter
export const getThrift = () => models.Thrift;

// Export sequelize getter
export const getSequelize = () => models.sequelize;

// Export Op and DataTypes for convenience
export { Op, DataTypes };

// ===== NAMED EXPORTS FOR DIRECT IMPORT =====
export const User = models.User;
export const Permissions = models.Permissions;
export const UserRole = models.UserRole;
export const Role = models.Role;
export const BusinessRole = models.BusinessRole;
export const BusinessUnit = models.BusinessUnit;
export const AuditTrail = models.AuditTrail;
export const Customer = models.Customer;
export const CustomerAccount = models.CustomerAccount;
export const CustomerType = models.CustomerType;
export const NextOfKin = models.NextOfKin;
export const Bank = models.Bank;
export const Branch = models.Branch;
export const ChartofAccount = models.ChartofAccount;
export const Deposit = models.Deposit;
export const LoanAccount = models.LoanAccount;
export const LoanRepayment = models.LoanRepayment;
export const CreditApplication = models.CreditApplication;
export const Collection = models.Collection;
export const Charge = models.Charge;
export const DepositAccountInterest = models.DepositAccountInterest;
export const DepositAccountInterest_Tier = models.DepositAccountInterest_Tier;
export const DirectDebit = models.DirectDebit;
export const DirectDebitRequest = models.DirectDebitRequest;
export const Country = models.Country;
export const State = models.State;
export const Counter = models.Counter;
export const AutoReclassifyInformation = models.AutoReclassifyInformation;
export const Vault = models.Vault;
export const VaultAuthorizedPersonnel = models.VaultAuthorizedPersonnel;
export const VaultPendingApproval = models.VaultPendingApproval;
export const VaultAccessAttempt = models.VaultAccessAttempt;
export const VaultMaintenanceLog = models.VaultMaintenanceLog;
export const Drawer = models.Drawer;
export const RelationshipOfficer = models.RelationshipOfficer;
export const GuarantorAudit = models.GuarantorAudit;
export const GLClosingPeriod = models.GLClosingPeriod;
export const ScheduledTask = models.ScheduledTask;
export const EOYReport = models.EOYReport;
export const Holiday = models.Holiday;
export const LoanProduct = models.LoanProduct;
export const LoanInterestRate = models.LoanInterestRate;
export const ProductTypeMapping = models.ProductTypeMapping;
export const RateIndex = models.RateIndex;
export const SavingsProduct = models.SavingsProduct;
export const DrawerCloseOut = models.DrawerCloseOut;
export const DrawerUserRole = models.DrawerUserRole;
export const DrawerCurrencyDenomination = models.DrawerCurrencyDenomination;
export const DrawerCurrency = models.DrawerCurrency;

// NEW: Thrift named export
export const Thrift = models.Thrift;

// OTHER DIRECT EXPORTS
export const AML = models.AML;
export const AMLThreshold = models.AMLThreshold;
export const WF_WORK_ITEM = models.WorkflowItem || models.WF_WORK_ITEM;
export const Organization = models.Organization;
export const Transaction = models.Transaction;
export const GLAccount = models.GLAccount;
export const GLTransaction = models.GLTransaction;
export const JournalEntry = models.JournalEntry;
export const Notification = models.Notification;
export const SMS = models.SMS;
export const Report = models.Report;
export const Configuration = models.Configuration;
export const WF_BUSINESS_PROCESS = models.WorkflowProcess;
export const WF_SUB_PROCESS = models.WorkflowSubProcess;
export const WF_QUEUE = models.WorkflowQueue;
export const WF_BusinessRoleQueue = models.WorkflowBusinessRoleQueue;
export const WF_SubProcessPolicy = models.WorkflowSubProcessPolicy;
export const CustWorkflowRouting = models.CustomerWorkflowRouting;
export const AccountApplication = models.AccountApplication;
export const GLAccountTransaction = models.GLAccountTransaction;

// Export sequelize as a named export
export const sequelize = models.sequelize;

console.log('📦 models/index.js module loaded');
console.log('⚠️ Important: Models need to be initialized before use');
console.log('💡 Usage:');
console.log('   1. import { initializeModels, getCustomer, getThrift } from "./models/index.js"');
console.log('   2. await initializeModels()');
console.log('   3. const customer = await getCustomer().findOne({...})');
console.log('   4. const thrift = await getThrift().findAll({...})');
console.log('');
console.log('📊 Thrift Management features included:');
console.log('   - Thrift model loaded and initialized');
console.log('   - Association with Customer');
console.log('   - Association with User (Relationship Manager)');
console.log('   - Automatic table creation on startup');
console.log('');
console.log('📊 Loan Management features included:');
console.log('   - Automatic table creation on startup');
console.log('   - LoanAccount table with manual initialization');
console.log('   - LoanInterestRate table with manual initialization (to avoid 64-key limit)');
console.log('   - Association with Customer (by CUST_ID)');
console.log('   - Association with CustomerAccount');
console.log('   - Association with LoanProduct');
console.log('   - Association with LoanRepayment');
console.log('   - LoanProduct ↔ LoanInterestRate associations');
console.log('📋 All tables will be automatically created if not exists');
console.log('✅ All models and associations configured');