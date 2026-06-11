// src/utils/modelLoader.js - UPDATED VERSION
import logger from './logger.js';
import sequelize from '../../config/db.js'; // Import the sequelize instance

class ModelLoader {
  constructor() {
    this.models = {};
    this.isInitialized = false;
    this.initializationPromise = null;
    this.sequelizeInstance = sequelize; // Store sequelize instance
  }

  async initialize() {
    // Return cached promise if already initializing
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        if (this.isInitialized) {
          return this.models;
        }

        logger.info('🚀 Initializing model loader...');

        // Method 1: Try importing from models/index.js
        try {
          const modelsModule = await import('../models/index.js');
          this.models = modelsModule.default || modelsModule;
          logger.info('✅ Models loaded via index.js');
        } catch (indexError) {
          logger.warn('⚠️ Could not load models via index.js:', indexError.message);
          await this.loadModelsIndividually();
        }

        // Check for missing required models and try to load them
        await this.loadMissingModels();

        this.isInitialized = true;
        logger.info('✅ Model loader initialized successfully');
        logger.info(`📊 Loaded models: ${Object.keys(this.models).join(', ')}`);

        return this.models;
      } catch (error) {
        logger.error('❌ Model loader initialization failed:', error.message, error.stack);
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  async loadModelsIndividually() {
    // Comprehensive list of all models from your routes
    const modelFiles = [
      // User/Login/Auth
      'User.js', 'UserRole.js', 'Permission.js', 'Login.js',
      
      // Customer related
      'Customer.js', 'CustomerAccount.js', 'CustomerType.js', 
      'IdentificationInformation.js', 'Guarantor.js', 'NextOfKin.js',
      
      // Deposit/Account related
      'Deposit.js', 'DepositTransaction.js', 'DepositAccountSummary.js',
      'DepositAccountApplication.js', 'DepositAccountHistory.js',
      'DepositAccountInterest.js', 'Deposit_Account_INTEREST$AUD.js',
      'DepositAccountInterestOption.js', 'DepositAccountInterest_Tier.js',
      'DepositAccountMonthlyStat.js', 'TermDeposit.js',
      
      // Loan related
      'LoanAccount.js', 'LoanAccountDetails.js', 'LoanContractForm.js',
      'LoanFee.js', 'LoanProduct.js', 'LoanRepayment.js',
      'CreditApplication.js', 'RepaymentSchedule.js',
      
      // Transaction related
      'Transaction.js', 'CashWithdrawalTransaction.js', 'Withdrawal.js',
      
      // System/Config
      'SystemDate.js', 'Holiday.js', 'BusinessUnit.js', 'BusinessRole.js',
      'License.js', 'Country.js', 'SavingsProducts.js', 'ProductTypeMapping.js',
      
      // Workflow
      'WF_BUSINESS_PROCESS.js', 'WF_QUEUE.js', 'WF_WORK_ITEM.js',
      'WF_SUB_PROCESS.js', 'WF_SubProcessPolicy.js', 'WF_BusinessRoleQueue.js',
      'CustWorkflowRouting.js',
      
      // GL/Accounting
      'GLAccount.js', 'GLAccountTransaction.js', 'Ledger.js',
      'InterestCalculationService.js',
      
      // Drawer/Teller
      'Drawer.js', 'DrawerCurrencyDenomination.js', 'DrawerReassignment.js',
      'DrawerUserRole.js',
      
      // Direct Debit - IMPORTANT: These are already in your list
      'DirectDebit.js', 'DirectDebitRequest.js', 'DirectDebitScheduler.js',
      
      // Notifications
      'NotificationService.js', 'SMS.js',
      
      // Audit/Analytics
      'AuditTrail.js', 'Analytics.js', 'Dashboard.js',
      
      // Upload/Files
      'UploadFile.js', 'Subfolder.js',
      
      // Events/Policy
      'Event.js', 'AutoReclassify.js', 'RelationshipOfficer.js',
      'TransactionPolicy.js',
      
      // System/Config
      'System.js', 'Config.js',
      
      // Reports
      'Report.js', 'AccountStatement.js', 'IncomeExpense.js',
      
      // Charges/GL
      'Charge.js', 'Identifier.js', 'GLCategories.js',
      
      // Branch/Organization
      'Branch.js', 'Organization.js',
      
      // Banking - THRIFT ADDED HERE
      'Bank.js', 'TellerStats.js', 'Thrift.js',
      
      // Credit/Thrift
      'CreditOfficer.js', 'TriftReport.js',
      
      // Cleanup
      'CleanupDB.js',
      
      // Standing Orders
      'StandingOrder.js',
      
      // Portfolio
      'LoanPortfolio.js',
      
      // Group Banking
      'Group.js', 'GroupSavings.js',
      
      // Debug/Test
      'UploadTest.js',
      
      // Loan Summary
      'LoanAccountSummary.js', 'LoanRepaymentTransaction.js', 'Collection.js',
      
      // Accounts
      'Account.js', 'ChartOfAccount.js',
      
      // Vault
      'VaultConfig.js', 'Vault.js', 'VaultTransaction.js',
      
      // Calculator/Rates
      'LoanCalculator.js', 'Portfolio.js', 'RateIndex.js',
      
      // Customer Transactions
      'CustomerTransaction.js', 'DisbursementReport.js',
      
      // New MySQL/Sequelize models
      'Penalty.js', 'Organization.js', 'OverdueLoan.js', 'NotificationService.js',
      'GuarantorAudit.js', 'Configuration.js', 'AccountApplication.js',
      
      // AML
      'AML.js', 'AMLThreshold.js',
      
      // Inward Funds
      'InwardFundsTransferWebhook.js'
    ];

    for (const file of modelFiles) {
      try {
        const modelName = file.replace('.js', '');
        const modelModule = await import(`../models/${file}`);
        this.models[modelName] = modelModule.default || modelModule;
        
        // Special logging for Thrift and DirectDebit models
        if (modelName === 'Thrift') {
          logger.info(`✅ SUCCESS: Thrift model loaded from ${file}`);
        } else if (modelName === 'DirectDebit') {
          logger.info(`✅ SUCCESS: DirectDebit model loaded from ${file}`);
        } else {
          logger.debug(`✅ Loaded ${modelName} individually`);
        }
      } catch (error) {
        // Don't log warnings for optional models
        if (!this.isOptionalModel(file)) {
          logger.debug(`ℹ️ Could not load ${file}: ${error.message}`);
        }
      }
    }
  }

  isOptionalModel(fileName) {
    // Some models might be optional or not exist yet
    const optionalModels = [
      'Deposit_Account_INTEREST$AUD.js',
      'DepositAccountInterest_Tier.js',
      'WF_SubProcessPolicy.js',
      'WF_BusinessRoleQueue.js',
      'CustWorkflowRouting.js',
      'UploadTest.js',
      'TriftReport.js',
      'CleanupDB.js',
      'InwardFundsTransferWebhook.js'
    ];
    return optionalModels.includes(fileName);
  }

  async loadMissingModels() {
    // List of models that are critical for the system to function
    const criticalModels = [
      'User',
      'Customer',
      'CustomerAccount',
      'LoanAccount',
      'LoanRepayment',
      'Deposit',
      'Transaction',
      'GLAccount',
      'AuditTrail',
      'Thrift',
      'DirectDebit',  // ADDED: DirectDebit to critical models
      'DirectDebitRequest'  // ADDED: DirectDebitRequest to critical models
    ];

    for (const modelName of criticalModels) {
      if (!this.models[modelName]) {
        try {
          logger.info(`🔍 Loading critical model ${modelName} on demand...`);
          const modelModule = await import(`../models/${modelName}.js`);
          this.models[modelName] = modelModule.default || modelModule;
          logger.info(`✅ Loaded critical model ${modelName} on demand`);
        } catch (error) {
          logger.error(`❌ Critical model ${modelName} not found: ${error.message}`);
          
          // Special handling for Thrift - try alternate paths
          if (modelName === 'Thrift') {
            try {
              logger.info('🔄 Trying alternate path for Thrift model...');
              // Try with different case variations
              const alternatePaths = [
                '../models/thrift.js',
                '../models/THRIFT.js',
                '../models/ThriftAccount.js',
                '../models/THRIFT_ACCOUNTS.js'
              ];
              
              for (const altPath of alternatePaths) {
                try {
                  const altModule = await import(altPath);
                  if (altModule.default || altModule) {
                    this.models.Thrift = altModule.default || altModule;
                    logger.info(`✅ Loaded Thrift from alternate path: ${altPath}`);
                    break;
                  }
                } catch (e) {
                  // Continue trying
                }
              }
            } catch (altError) {
              logger.error('❌ All alternate paths failed for Thrift model');
            }
          }
          
          // Special handling for DirectDebit - try alternate paths
          if (modelName === 'DirectDebit') {
            try {
              logger.info('🔄 Trying alternate path for DirectDebit model...');
              const alternatePaths = [
                '../models/directdebit.js',
                '../models/DIRECTDEBIT.js',
                '../models/DirectDebitRequest.js'  // Might be in request file
              ];
              
              for (const altPath of alternatePaths) {
                try {
                  const altModule = await import(altPath);
                  if (altModule.default || altModule) {
                    this.models.DirectDebit = altModule.default || altModule;
                    logger.info(`✅ Loaded DirectDebit from alternate path: ${altPath}`);
                    break;
                  }
                } catch (e) {
                  // Continue trying
                }
              }
            } catch (altError) {
              logger.error('❌ All alternate paths failed for DirectDebit model');
            }
          }
        }
      }
    }
  }

  getModel(name) {
    if (!this.isInitialized) {
      throw new Error(`Models not initialized. Call initialize() first. Requested: ${name}`);
    }

    const model = this.models[name];
    if (!model) {
      const available = Object.keys(this.models).join(', ');
      throw new Error(`Model ${name} not found. Available: ${available}`);
    }

    return model;
  }

  areModelsInitialized() {
    return this.isInitialized;
  }

  getAllModels() {
    return { ...this.models };
  }

  hasModel(name) {
    return this.isInitialized && !!this.models[name];
  }

  getLoadedModelNames() {
    return Object.keys(this.models);
  }

  getModelsByCategory() {
    const categories = {
      customer: ['Customer', 'CustomerAccount', 'CustomerType', 'NextOfKin', 'Guarantor'],
      loan: ['LoanAccount', 'LoanRepayment', 'LoanProduct', 'CreditApplication', 'RepaymentSchedule'],
      deposit: ['Deposit', 'DepositTransaction', 'TermDeposit', 'DepositAccountSummary'],
      transaction: ['Transaction', 'CashWithdrawalTransaction', 'Withdrawal'],
      user: ['User', 'UserRole', 'Permission'],
      system: ['SystemDate', 'Holiday', 'BusinessUnit', 'Configuration'],
      accounting: ['GLAccount', 'GLAccountTransaction', 'Ledger', 'ChartOfAccount'],
      workflow: ['WF_BUSINESS_PROCESS', 'WF_QUEUE', 'WF_WORK_ITEM'],
      audit: ['AuditTrail'],
      notification: ['NotificationService', 'SMS'],
      thrift: ['Thrift', 'TriftReport', 'CreditOfficer'],
      directdebit: ['DirectDebit', 'DirectDebitRequest', 'DirectDebitScheduler']  // ADDED: New category
    };

    const result = {};
    for (const [category, models] of Object.entries(categories)) {
      result[category] = models.filter(model => this.hasModel(model));
    }
    return result;
  }

  getSequelize() {
    return this.sequelizeInstance;
  }

  getOp() {
    return this.sequelizeInstance.Op;
  }

  getDataTypes() {
    return this.sequelizeInstance.DataTypes;
  }
}

// Create singleton instance
const modelLoader = new ModelLoader();

// ==================== EXPORTS ====================
// Export singleton instance as default
export default modelLoader;

// Core functions
export const initializeModels = () => modelLoader.initialize();
export const getModel = (name) => modelLoader.getModel(name);
export const areModelsInitialized = () => modelLoader.areModelsInitialized();
export const getAllModels = () => modelLoader.getAllModels();
export const hasModel = (name) => modelLoader.hasModel(name);
export const getLoadedModelNames = () => modelLoader.getLoadedModelNames();
export const getModelsByCategory = () => modelLoader.getModelsByCategory();

// Sequelize exports
export const getSequelize = () => modelLoader.getSequelize();
export const getOp = () => modelLoader.getOp();
export const getDataTypes = () => modelLoader.getDataTypes();

// ==================== ALL MODEL GETTERS ====================
// Customer related
export const getCustomer = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Customer');
};

export const getCustomerType = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CustomerType');
};

export const getNextOfKin = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('NextOfKin');
};

export const getCustomerAccount = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CustomerAccount');
};

export const getGuarantor = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Guarantor');
};

export const getIdentificationInformation = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('IdentificationInformation');
};

// User/Auth related
export const getUser = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('User');
};

export const getUserRole = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('UserRole');
};

export const getPermission = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Permission');
};

export const getLogin = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Login');
};

// Loan related
export const getLoanAccount = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanAccount');
};

export const getLoanRepayment = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanRepayment');
};

export const getLoanProduct = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanProduct');
};

export const getLoanFee = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanFee');
};

export const getLoanContractForm = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanContractForm');
};

export const getCreditApplication = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CreditApplication');
};

export const getRepaymentSchedule = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('RepaymentSchedule');
};

export const getLoanAccountDetails = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanAccountDetails');
};

// Deposit related
export const getDeposit = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Deposit');
};

export const getDepositTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DepositTransaction');
};

export const getDepositAccountSummary = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DepositAccountSummary');
};

export const getTermDeposit = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('TermDeposit');
};

// Transaction related
export const getTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Transaction');
};

export const getCashWithdrawalTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CashWithdrawalTransaction');
};

export const getWithdrawal = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Withdrawal');
};

// System/Config
export const getBranch = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Branch');
};

export const getBusinessUnit = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('BusinessUnit');
};

export const getSystemDate = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('SystemDate');
};

export const getHoliday = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Holiday');
};

export const getLicense = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('License');
};

export const getCountry = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Country');
};

export const getSavingsProducts = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('SavingsProducts');
};

export const getProductTypeMapping = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('ProductTypeMapping');
};

// GL/Accounting
export const getGLAccount = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('GLAccount');
};

export const getGLAccountTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('GLAccountTransaction');
};

export const getLedger = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Ledger');
};

export const getInterestCalculationService = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('InterestCalculationService');
};

// ===== FIXED: Direct Debit getters - NOW PROPERLY EXPORTED =====
export const getDirectDebit = async () => {
  await modelLoader.initialize();
  try {
    return modelLoader.getModel('DirectDebit');
  } catch (error) {
    logger.error('❌ Failed to get DirectDebit model:', error.message);
    throw error;
  }
};

export const getDirectDebitRequest = async () => {
  await modelLoader.initialize();
  try {
    return modelLoader.getModel('DirectDebitRequest');
  } catch (error) {
    logger.error('❌ Failed to get DirectDebitRequest model:', error.message);
    throw error;
  }
};

export const getDirectDebitScheduler = async () => {
  await modelLoader.initialize();
  try {
    return modelLoader.getModel('DirectDebitScheduler');
  } catch (error) {
    logger.debug('DirectDebitScheduler not found (optional)');
    return null;
  }
};

// Audit/Notification
export const getAuditTrail = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AuditTrail');
};

export const getNotificationService = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('NotificationService');
};

export const getSMS = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('SMS');
};

// Analytics/Dashboard
export const getAnalytics = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Analytics');
};

export const getDashboard = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Dashboard');
};

// AML
export const getAML = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AML');
};

export const getAMLThreshold = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AMLThreshold');
};

// Thrift Banking
export const getThrift = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Thrift');
};

export const getTriftReport = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('TriftReport');
};

export const getCreditOfficer = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CreditOfficer');
};

// Organization
export const getOrganization = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Organization');
};

// Configuration
export const getConfiguration = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Configuration');
};

// Account Application
export const getAccountApplication = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AccountApplication');
};

// Penalty
export const getPenalty = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Penalty');
};

// Overdue Loan
export const getOverdueLoan = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('OverdueLoan');
};

// Guarantor Audit
export const getGuarantorAudit = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('GuarantorAudit');
};

// Group Banking
export const getGroup = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Group');
};

export const getGroupSavings = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('GroupSavings');
};

// Vault
export const getVault = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Vault');
};

export const getVaultConfig = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('VaultConfig');
};

export const getVaultTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('VaultTransaction');
};

// Portfolio
export const getPortfolio = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Portfolio');
};

export const getLoanPortfolio = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanPortfolio');
};

// Rate Index
export const getRateIndex = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('RateIndex');
};

// Loan Calculator
export const getLoanCalculator = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanCalculator');
};

// Customer Transactions
export const getCustomerTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CustomerTransaction');
};

// Disbursement Report
export const getDisbursementReport = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DisbursementReport');
};

// Collection
export const getCollection = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Collection');
};

// Account
export const getAccount = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Account');
};

// Chart of Account
export const getChartOfAccount = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('ChartOfAccount');
};

// Loan Account Summary
export const getLoanAccountSummary = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanAccountSummary');
};

// Loan Repayment Transaction
export const getLoanRepaymentTransaction = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('LoanRepaymentTransaction');
};

// Standing Order
export const getStandingOrder = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('StandingOrder');
};

// Cleanup DB
export const getCleanupDB = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('CleanupDB');
};

// Upload Test
export const getUploadTest = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('UploadTest');
};

// Upload File
export const getUploadFile = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('UploadFile');
};

// Subfolder
export const getSubfolder = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Subfolder');
};

// Event
export const getEvent = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Event');
};

// Auto Reclassify
export const getAutoReclassify = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AutoReclassify');
};

// Relationship Officer
export const getRelationshipOfficer = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('RelationshipOfficer');
};

// Transaction Policy
export const getTransactionPolicy = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('TransactionPolicy');
};

// System
export const getSystem = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('System');
};

// Config
export const getConfig = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Config');
};

// Report
export const getReport = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Report');
};

// Account Statement
export const getAccountStatement = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('AccountStatement');
};

// Income Expense
export const getIncomeExpense = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('IncomeExpense');
};

// Charge
export const getCharge = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Charge');
};

// Identifier
export const getIdentifier = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Identifier');
};

// GL Categories
export const getGLCategories = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('GLCategories');
};

// Bank
export const getBank = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Bank');
};

// Teller Stats
export const getTellerStats = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('TellerStats');
};

// Workflow
export const getWFBusinessProcess = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('WF_BUSINESS_PROCESS');
};

export const getWFQueue = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('WF_QUEUE');
};

export const getWFWorkItem = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('WF_WORK_ITEM');
};

export const getWFSubProcess = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('WF_SUB_PROCESS');
};

// Drawer
export const getDrawer = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('Drawer');
};

export const getDrawerCurrencyDenomination = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DrawerCurrencyDenomination');
};

export const getDrawerReassignment = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DrawerReassignment');
};

export const getDrawerUserRole = async () => {
  await modelLoader.initialize();
  return modelLoader.getModel('DrawerUserRole');
};

export const initModels = initializeModels;  // Alias for backward compatibility

// Also export as global for backward compatibility
if (typeof global !== 'undefined') {
  global.modelLoader = modelLoader;
}

// Auto-initialize in development mode (optional)
if (process.env.NODE_ENV === 'development') {
  setTimeout(async () => {
    try {
      logger.info('🔧 Auto-initializing models in development mode...');
      await modelLoader.initialize();
      
      // Log model statistics
      const loaded = modelLoader.getLoadedModelNames();
      const byCategory = modelLoader.getModelsByCategory();
      
      logger.info(`📊 Model Statistics:`);
      logger.info(`   Total models loaded: ${loaded.length}`);
      
      for (const [category, models] of Object.entries(byCategory)) {
        if (models.length > 0) {
          logger.info(`   ${category.toUpperCase()}: ${models.length} models`);
        }
      }
      
      // Specifically check if Thrift and DirectDebit were loaded
      if (modelLoader.hasModel('Thrift')) {
        logger.info('✅ Thrift model successfully loaded and available');
      } else {
        logger.warn('⚠️ Thrift model was not loaded - check for errors above');
      }
      
      if (modelLoader.hasModel('DirectDebit')) {
        logger.info('✅ DirectDebit model successfully loaded and available');
      } else {
        logger.warn('⚠️ DirectDebit model was not loaded - check for errors above');
      }
      
    } catch (error) {
      logger.warn('⚠️ Auto-initialization failed:', error.message);
    }
  }, 2000);
}