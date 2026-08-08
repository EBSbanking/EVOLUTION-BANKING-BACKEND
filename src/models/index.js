// src/models/index.js – COMPLETE WITH ALL VAULT MODELS, PENALTY RULE, EMTL, JOURNAL ENTRIES & PENDING TRANSFER
import sequelize from '../../config/db.js';
import { DataTypes, Op, QueryTypes } from 'sequelize';

console.log('📦 Starting model imports (static)...');

// ========== STATIC IMPORTS ==========
import Account from './Accounts.js';
import AccountApplication from './AccountApplication.js';
import AdminUser from './AdminUser.js';
import AdminService from './AdminService.js';
import AML from './AML.js';
import AMLThreshold from './AMLThreshold.js';
import AuditTrail from './AuditTrail.js';
import AutoReclassifyInformation from './AutoReclassifyInformation.js';
import Bank from './Banks.js';
import BinInfo from './BinInfo.js';
import Branch from './Branch.js';
import BusinessRole from './BusinessRole.js';
import BusinessUnit from './BusinessUnit.js';
import CardCounter from './CardCounter.js';
import CardSettlementConfig from './CardSettlementConfig.js';
import CashWithdrawalTransaction from './CashWithdrawalTransaction.js';
import Charge from './Charge.js';
import ChargeTier from './ChargeTier.js';
import ChartofAccount from './ChartofAccount.js';
import Collection from './Collection.js';
import ConfigurationService from './ConfigurationService.js';
import Country from './Country.js';
import Counter from './Counter.js';
import CreditApplication from './CreditApplication.js';
import Customer from './Customer.js';
import CustomerAccount from './CustomerAccount.js';
import CustomerType from './CustomerType.js';
import DebitCard from './DebitCard.js';
import Deposit from './Deposit.js';
import DepositAccountApplication from './DepositAccountApplication.js';
import DepositAccountInterest from './DepositAccountInterest.js';
import DepositAccountInterest_Tier from './DepositAccountInterest_Tier.js';
import DepositTransaction from './DepositTransaction.js';
import DirectDebit from './DirectDebit.js';
import DirectDebitRequest from './DirectDebitRequest.js';
import Drawer from './Drawer.js';
import DrawerCloseOut from './DrawerCloseOut.js';
import DrawerCurrency from './DrawerCurrency.js';
import DrawerCurrencyDenomination from './DrawerCurrencyDenomination.js';
import DrawerUserRole from './DrawerUserRole.js';
import Event from './Event.js';
import GLAccount from './GLAccount.js';
import GLAccountCategory from './GLAccountCategory.js';
import GLClosingPeriods from './GlClosingPeriods.js';
import GLAccountTransaction from './GLAccountTransaction.js';
import Group from './Group.js';
import GroupSavings from './GroupSavings.js';
import Guarantor from './Guarantor.js';
import GuarantorAudit from './GuarantorAudit.js';
import Holiday from './Holiday.js';
import IdentificationInformation from './IdentificationInformation.js';
import InterestAccrual from './InterestAccrual.js';
import License from './License.js';
import LoanAccount from './LoanAccount.js';
import LoanAccountSummary from './LoanAccountSummary.js';
import LoanContractForm from './LoanContractForm.js';
import LoanFee from './LoanFee.js';
import LoanInterestRate from './LoanInterestRate.js';
import LoanPenalty from './LoanPenalty.js';
import LoanPortfolio from './LoanPortfolio.js';
import LoanProduct from './LoanProduct.js';
import LoanRepayment from './LoanRepayment.js';
import LoanRepaymentHistory from './LoanRepaymentHistory.js';
import LoanRepaymentTransaction from './LoanRepaymentTransaction.js';
import LoginPolicy from './LoginPolicy.js';
import NextOfKin from './NextOfKin.js';
import Organization from './Organization.js';
import OverdueLoan from './OverdueLoan.js';
import PenaltyRule from './PenaltyRule.js';
import Permissions from './Permissions.js';
import ProductTypeMapping from './ProductTypeMapping.js';
import RateIndex from './Rate-Index.js';
import RelationshipOfficer from './RelationshipOfficer.js';
import RepaymentSchedule from './RepaymentSchedules.js';
import Role from './Role.js';
import SMS from './SMS.js';
import SavingsProduct from './SavingsProduct.js';
import ScheduledTask from './ScheduledTask.js';
import StandingOrder from './StandingOrder.js';
import State from './State.js';
import Subfolder from './Subfolder.js';
import SystemConfig from './SystemConfig.js';
import SystemDate from './SystemDate.js';
import TermDeposit from './TermDeposit.js';
import Thrift from './Thrift.js';
import ThriftSettings from './ThriftSettings.js';
import Transaction from './Transaction.js';
import TransactionPolicy from './TransactionPolicy.js';
import User from './User.js';
import UserRole from './UserRole.js';
import WF_WORK_ITEM from './WF_WORK_ITEM.js';
import LoanDisbursement from './Disbursement.js';
import Ledger from './Ledger.js';
import LoanEvent from './LoanEvent.js';

// ===== MODULE & ROLE MANAGEMENT =====
import Module from './Module.js';
import Notification from './Notification.js';
import RoleModule from './RoleModule.js';

// ===== LOAN PROVISION =====
import LoanProvision from './LoanProvision.js';

// ===== INTEREST DISTRIBUTION (for Term Deposits) =====
import InterestDistribution from './InterestDistribution.js';
import AdminPlugin from './AdminPlugin.js';

// ================================================================
// ✅ EOY REPORT MODELS
import EOYReport from './EOYReport.js';
import GLClosingPeriod from './GLClosingPeriods.js';

// ================================================================
// ✅ USER SESSION & ACTIVITY LOG MODELS
// ================================================================
import UserSession from './UserSession.js';
import UserActivityLog from './UserActivityLog.js';

// ================================================================
// ✅ VAULT MODELS - Class-based only
// ================================================================
import Vault from './Vault.js';
import VaultPersonnel from './VaultPersonnel.js';
import VaultApprovalRequest from './VaultApprovalRequest.js';
import VaultAuditLog from './VaultAuditLog.js';
import VaultMaintenanceLog from './VaultMaintenanceLog.js';
import VaultConfiguration from './VaultConfiguration.js';
import VaultAccessAttempt from './VaultAccessAttempt.js';
import VaultAuthorizedPersonnel from './VaultAuthorizedPersonnel.js';
import VaultTransaction from './VaultTransaction.js';
import VaultPendingApproval from './VaultPendingApproval.js';
import VaultApprovalRequiredRole from './VaultApprovalRequiredRole.js';
import VaultCurrentApprover from './VaultCurrentApprover.js';
import VaultEscalationHierarchy from './VaultEscalationHierarchy.js';
import VaultRoleAccessMatrix from './VaultRoleAccessMatrix.js';

// ================================================================
// ✅ EMTL MODELS - Electronic Money Transfer Levy
// ================================================================
import EMTLPolicy from './EMTLPolicy.js';
import EMTLAuditLog from './EMTLAuditLog.js';
import EMTLTransaction from './EMTLTransaction.js';
import RemittanceBatch from './RemittanceBatch.js';

// ================================================================
// ✅ JOURNAL ENTRY MODELS
// ================================================================
import JournalEntry from './JournalEntry.js';
import JournalEntryLine from './JournalEntryLine.js';

// ================================================================
// ✅ INWARD TRANSFER MODELS
// ================================================================
import InwardFundsTransfer from './InwardFundsTransfer.js';
import PendingInwardTransaction from './PendingInwardTransaction.js';
import PendingTransfer from './PendingTransfer.js';
import PaystackTransaction from './PaystackPayment.js';
import PaymentReference from './PaymentReference.js';

// ================================================================
// ✅ CARD APPROVAL MODELS
// ================================================================
import CardApprovalRequest from './CardApprovalRequest.js';
import ApprovalWorkflowConfig from './ApprovalWorkflowConfig.js';  

// ========== initModel helper ==========
const initModel = (ModelDef, sequelize, DataTypes) => {
  if (!ModelDef) return null;
  if (ModelDef.sequelize && typeof ModelDef.init === 'function') return ModelDef;
  if (typeof ModelDef === 'function' && !ModelDef.prototype) return ModelDef(sequelize, DataTypes);
  if (typeof ModelDef === 'function' && ModelDef.prototype) {
    try {
      return new ModelDef(sequelize, DataTypes);
    } catch (err) {
      console.warn(`⚠️ Could not instantiate ${ModelDef.name}, using as is.`);
      return ModelDef;
    }
  }
  return ModelDef;
};

// ========== MODELS OBJECT ==========
const models = {};

const modelDefinitions = [
  { key: 'Account', def: Account },
  { key: 'AccountApplication', def: AccountApplication },
  { key: 'AdminUser', def: AdminUser },
  { key: 'AdminService', def: AdminService },
  { key: 'AML', def: AML },
  { key: 'AMLThreshold', def: AMLThreshold },
  { key: 'AuditTrail', def: AuditTrail },
  { key: 'AutoReclassifyInformation', def: AutoReclassifyInformation },
  { key: 'Bank', def: Bank },
  { key: 'BinInfo', def: BinInfo },
  { key: 'Branch', def: Branch },
  { key: 'BusinessRole', def: BusinessRole },
  { key: 'BusinessUnit', def: BusinessUnit },
  { key: 'CardCounter', def: CardCounter },
  { key: 'CardSettlementConfig', def: CardSettlementConfig },
  { key: 'CashWithdrawalTransaction', def: CashWithdrawalTransaction },
  { key: 'Charge', def: Charge },
  { key: 'ChargeTier', def: ChargeTier },
  { key: 'ChartofAccount', def: ChartofAccount },
  { key: 'Collection', def: Collection },
  { key: 'ConfigurationService', def: ConfigurationService },
  { key: 'Country', def: Country },
  { key: 'Counter', def: Counter },
  { key: 'CreditApplication', def: CreditApplication },
  { key: 'Customer', def: Customer },
  { key: 'CustomerAccount', def: CustomerAccount },
  { key: 'CustomerType', def: CustomerType },
  { key: 'DebitCard', def: DebitCard },
  { key: 'Deposit', def: Deposit },
  { key: 'DepositAccountApplication', def: DepositAccountApplication },
  { key: 'DepositAccountInterest', def: DepositAccountInterest },
  { key: 'DepositAccountInterest_Tier', def: DepositAccountInterest_Tier },
  { key: 'DepositTransaction', def: DepositTransaction },
  { key: 'DirectDebit', def: DirectDebit },
  { key: 'DirectDebitRequest', def: DirectDebitRequest },
  { key: 'Drawer', def: Drawer },
  { key: 'DrawerCloseOut', def: DrawerCloseOut },
  { key: 'DrawerCurrency', def: DrawerCurrency },
  { key: 'DrawerCurrencyDenomination', def: DrawerCurrencyDenomination },
  { key: 'DrawerUserRole', def: DrawerUserRole },
  { key: 'Event', def: Event },
  { key: 'GLAccount', def: GLAccount },
  { key: 'GLAccountCategory', def: GLAccountCategory },
  { key: 'GLClosingPeriods', def: GLClosingPeriods },
  { key: 'GLAccountTransaction', def: GLAccountTransaction },
  { key: 'Group', def: Group },
  { key: 'GroupSavings', def: GroupSavings },
  { key: 'Guarantor', def: Guarantor },
  { key: 'GuarantorAudit', def: GuarantorAudit },
  { key: 'Holiday', def: Holiday },
  { key: 'IdentificationInformation', def: IdentificationInformation },
  { key: 'InterestAccrual', def: InterestAccrual },
  { key: 'License', def: License },
  { key: 'LoanAccount', def: LoanAccount },
  { key: 'LoanAccountSummary', def: LoanAccountSummary },
  { key: 'LoanContractForm', def: LoanContractForm },
  { key: 'LoanFee', def: LoanFee },
  { key: 'LoanInterestRate', def: LoanInterestRate },
  { key: 'LoanPenalty', def: LoanPenalty },
  { key: 'LoanPortfolio', def: LoanPortfolio },
  { key: 'LoanProduct', def: LoanProduct },
  { key: 'LoanProvision', def: LoanProvision },
  { key: 'InterestDistribution', def: InterestDistribution },
  { key: 'LoanRepayment', def: LoanRepayment },
  { key: 'LoanRepaymentHistory', def: LoanRepaymentHistory },
  { key: 'LoanRepaymentTransaction', def: LoanRepaymentTransaction },
  { key: 'LoginPolicy', def: LoginPolicy },
  { key: 'NextOfKin', def: NextOfKin },
  { key: 'Organization', def: Organization },
  { key: 'OverdueLoan', def: OverdueLoan },
  { key: 'PenaltyRule', def: PenaltyRule },
  { key: 'Permissions', def: Permissions },
  { key: 'ProductTypeMapping', def: ProductTypeMapping },
  { key: 'RateIndex', def: RateIndex },
  { key: 'RelationshipOfficer', def: RelationshipOfficer },
  { key: 'RepaymentSchedule', def: RepaymentSchedule },
  { key: 'Role', def: Role },
  { key: 'SMS', def: SMS },
  { key: 'SavingsProduct', def: SavingsProduct },
  { key: 'ScheduledTask', def: ScheduledTask },
  { key: 'StandingOrder', def: StandingOrder },
  { key: 'State', def: State },
  { key: 'Subfolder', def: Subfolder },
  { key: 'SystemConfig', def: SystemConfig },
  { key: 'SystemDate', def: SystemDate },
  { key: 'TermDeposit', def: TermDeposit },
  { key: 'Thrift', def: Thrift },
  { key: 'ThriftSettings', def: ThriftSettings },
  { key: 'Transaction', def: Transaction },
  { key: 'TransactionPolicy', def: TransactionPolicy },
  { key: 'User', def: User },
  { key: 'UserRole', def: UserRole },
  { key: 'WF_WORK_ITEM', def: WF_WORK_ITEM },
  { key: 'LoanDisbursement', def: LoanDisbursement },
  { key: 'Ledger', def: Ledger },
  { key: 'LoanEvent', def: LoanEvent },
  // Module Management
  { key: 'Module', def: Module },
  { key: 'RoleModule', def: RoleModule },
  { key: 'AdminPlugin', def: AdminPlugin },
  // ================================================================
  // ✅ USER SESSION & ACTIVITY LOG MODELS
  // ================================================================
  { key: 'UserSession', def: UserSession },
  { key: 'UserActivityLog', def: UserActivityLog },
  // ================================================================
  // ✅ VAULT MODELS - Class-based only
  // ================================================================
  { key: 'Vault', def: Vault },
  { key: 'VaultPersonnel', def: VaultPersonnel },
  { key: 'VaultApprovalRequest', def: VaultApprovalRequest },
  { key: 'VaultAuditLog', def: VaultAuditLog },
  { key: 'VaultMaintenanceLog', def: VaultMaintenanceLog },
  { key: 'VaultConfiguration', def: VaultConfiguration },
  { key: 'VaultAccessAttempt', def: VaultAccessAttempt },
  { key: 'VaultAuthorizedPersonnel', def: VaultAuthorizedPersonnel },
  { key: 'VaultTransaction', def: VaultTransaction },
  { key: 'VaultPendingApproval', def: VaultPendingApproval },
  { key: 'VaultApprovalRequiredRole', def: VaultApprovalRequiredRole },
  { key: 'VaultCurrentApprover', def: VaultCurrentApprover },
  { key: 'VaultEscalationHierarchy', def: VaultEscalationHierarchy },
  { key: 'VaultRoleAccessMatrix', def: VaultRoleAccessMatrix },
  // ================================================================
  // ✅ EMTL MODELS
  // ================================================================
  { key: 'EMTLPolicy', def: EMTLPolicy },
  { key: 'EMTLAuditLog', def: EMTLAuditLog },
  { key: 'EMTLTransaction', def: EMTLTransaction },
  { key: 'RemittanceBatch', def: RemittanceBatch },
  // ================================================================
  // EOY Report Models
  // ================================================================
  { key: 'EOYReport', def: EOYReport },
  { key: 'GLClosingPeriod', def: GLClosingPeriod },

  // ================================================================
  // ✅ JOURNAL ENTRY MODELS
  // ================================================================
  { key: 'JournalEntry', def: JournalEntry },
  { key: 'JournalEntryLine', def: JournalEntryLine },
  // ================================================================
  // ✅ INWARD TRANSFER MODELS
  // ================================================================
  { key: 'InwardFundsTransfer', def: InwardFundsTransfer },
  { key: 'PendingInwardTransaction', def: PendingInwardTransaction },
  { key: 'PendingTransfer', def: PendingTransfer },
  { key: 'PaystackTransaction', def: PaystackTransaction },
  { key: 'PaymentReference', def: PaymentReference },
  // ================================================================
  // ✅ CARD APPROVAL MODELS
  // ================================================================
  { key: 'CardApprovalRequest', def: CardApprovalRequest },
  { key: 'ApprovalWorkflowConfig', def: ApprovalWorkflowConfig },
  // ================================================================
];

for (const { key, def } of modelDefinitions) {
  try {
    const initialized = initModel(def, sequelize, DataTypes);
    if (initialized) models[key] = initialized;
    else console.warn(`⚠️ Skipped ${key}: initialisation returned null`);
  } catch (err) {
    console.error(`❌ Failed to initialise model ${key}:`, err.message);
  }
}

models.sequelize = sequelize;
models.Op = Op;
models.DataTypes = DataTypes;
models.QueryTypes = QueryTypes;

// ========== ASSOCIATIONS ==========
function setupAssociations() {
  console.log('🔗 Setting up model associations...');
  const { 
    StandingOrder, 
    CustomerAccount, 
    DebitCard, 
    Account, 
    CardSettlementConfig, 
    LoanEvent, 
    Charge, 
    ChargeTier, 
    Role, 
    Module, 
    RoleModule,
    LoanProvision,
    LoanAccount,
    TermDeposit,
    InterestDistribution,
    Customer,
    DepositAccountInterest_Tier,
    SavingsProduct,
    LoanPenalty,
    PenaltyRule,
    EOYReport,
    GLClosingPeriod,
    // ================================================================
    // ✅ USER SESSION & ACTIVITY LOG MODELS
    // ================================================================
    UserSession,
    UserActivityLog,
    // ================================================================
    // ✅ VAULT MODELS
    // ================================================================
    Vault,
    VaultPersonnel,
    VaultApprovalRequest,
    VaultAuditLog,
    VaultMaintenanceLog,
    VaultConfiguration,
    VaultAccessAttempt,
    VaultAuthorizedPersonnel,
    VaultTransaction,
    VaultPendingApproval,
    VaultApprovalRequiredRole,
    VaultCurrentApprover,
    VaultEscalationHierarchy,
    VaultRoleAccessMatrix,
    Drawer,
    Branch,
    User,
    Transaction: TransactionModel,
    RepaymentSchedule,
    // ================================================================
    // ✅ EMTL MODELS
    // ================================================================
    EMTLPolicy,
    EMTLAuditLog,
    EMTLTransaction,
    RemittanceBatch,
    // ================================================================
    // ✅ JOURNAL ENTRY MODELS
    // ================================================================
    JournalEntry,
    JournalEntryLine,
    GLAccount,
    // ================================================================
    // ✅ INWARD TRANSFER MODELS
    // ================================================================
    InwardFundsTransfer,
    PendingInwardTransaction,
    PendingTransfer,
    PaystackTransaction,
    PaymentReference,
    CardApprovalRequest,
    ApprovalWorkflowConfig,
  } = models;

  // ================================================================
  // ✅ USER SESSION & ACTIVITY LOG ASSOCIATIONS
  // ================================================================
  
  // User ↔ UserSession (One-to-Many)
  if (User && UserSession) {
    User.hasMany(UserSession, {
      foreignKey: 'user_id',
      sourceKey: 'id',
      as: 'sessions',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    UserSession.belongsTo(User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'User',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    console.log('✅ User ↔ UserSession');
  }

  // User ↔ UserActivityLog (One-to-Many)
  if (User && UserActivityLog) {
    User.hasMany(UserActivityLog, {
      foreignKey: 'user_id',
      sourceKey: 'id',
      as: 'activities',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    UserActivityLog.belongsTo(User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'User',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    console.log('✅ User ↔ UserActivityLog');
  }

  // UserSession ↔ UserActivityLog (One-to-Many)
  if (UserSession && UserActivityLog) {
    UserSession.hasMany(UserActivityLog, {
      foreignKey: 'session_id',
      sourceKey: 'id',
      as: 'activities',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
    UserActivityLog.belongsTo(UserSession, {
      foreignKey: 'session_id',
      targetKey: 'id',
      as: 'Session',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
    console.log('✅ UserSession ↔ UserActivityLog');
  }

  // StandingOrder ↔ CustomerAccount
  if (StandingOrder && CustomerAccount) {
    StandingOrder.belongsTo(CustomerAccount, { foreignKey: 'customerAcctNo', targetKey: 'account_number', as: 'customerAccount' });
    CustomerAccount.hasMany(StandingOrder, { foreignKey: 'customerAcctNo', sourceKey: 'account_number', as: 'standingOrders' });
    console.log('✅ StandingOrder ↔ CustomerAccount');
  }

  // DebitCard ↔ CustomerAccount
  if (DebitCard && CustomerAccount) {
    DebitCard.belongsTo(CustomerAccount, { foreignKey: 'account_id', as: 'customerAccount' });
    CustomerAccount.hasMany(DebitCard, { foreignKey: 'account_id', as: 'debitCards' });
    console.log('✅ DebitCard ↔ CustomerAccount');
  }

  // DebitCard ↔ Account
  if (DebitCard && Account) {
    DebitCard.belongsTo(Account, { foreignKey: 'account_id', as: 'operationalAccount' });
    console.log('✅ DebitCard ↔ Account');
  }

  // CardSettlementConfig ↔ Account
  if (CardSettlementConfig && Account) {
    CardSettlementConfig.belongsTo(Account, { as: 'operationalAccount', foreignKey: 'operational_account_id' });
    Account.hasOne(CardSettlementConfig, { foreignKey: 'operational_account_id', as: 'settlementConfig' });
    console.log('✅ CardSettlementConfig ↔ Account');
  }

  // LoanEvent associations
  if (LoanEvent && typeof LoanEvent.associate === 'function') LoanEvent.associate(models);

  // Charge ↔ ChargeTier
  if (Charge && ChargeTier) {
    if (typeof Charge.associate === 'function') {
      Charge.associate({ ChargeTier });
    } else {
      Charge.hasMany(ChargeTier, { foreignKey: 'charge_id', as: 'tiers', onDelete: 'CASCADE' });
    }
    ChargeTier.belongsTo(Charge, { foreignKey: 'charge_id', as: 'charge' });
    console.log('✅ Charge ↔ ChargeTier');
  }

  // Module ↔ Role (many-to-many via RoleModule)
  if (Module && Role && RoleModule) {
    Module.belongsToMany(Role, {
      through: RoleModule,
      foreignKey: 'moduleId',
      otherKey: 'roleId',
      targetKey: 'role_id',
      as: 'roles',
    });
    Role.belongsToMany(Module, {
      through: RoleModule,
      foreignKey: 'roleId',
      otherKey: 'moduleId',
      as: 'modules',
    });
    console.log('✅ Module ↔ Role (via RoleModule)');
  }

  // ===== LOAN PROVISION ASSOCIATIONS =====
  if (LoanProvision && LoanAccount) {
    LoanProvision.belongsTo(LoanAccount, { foreignKey: 'loan_account_id', as: 'loanAccount' });
    LoanAccount.hasMany(LoanProvision, { foreignKey: 'loan_account_id', as: 'provisions' });
    console.log('✅ LoanProvision ↔ LoanAccount');
  }

  // ===== DEPOSIT ACCOUNT INTEREST TIER ASSOCIATIONS =====
  if (DepositAccountInterest_Tier && SavingsProduct) {
    DepositAccountInterest_Tier.belongsTo(SavingsProduct, {
      foreignKey: 'product_type',
      targetKey: 'PRODUCT_TYPE',
      as: 'product'
    });
    SavingsProduct.hasMany(DepositAccountInterest_Tier, {
      foreignKey: 'product_type',
      sourceKey: 'PRODUCT_TYPE',
      as: 'interestTiers'
    });
    console.log('✅ DepositAccountInterest_Tier ↔ SavingsProduct');
  }

  // ===== TERM DEPOSIT ASSOCIATIONS =====
  if (TermDeposit && CustomerAccount) {
    TermDeposit.belongsTo(CustomerAccount, { 
      foreignKey: 'sourceAccountId', 
      as: 'sourceAccount' 
    });
    TermDeposit.belongsTo(CustomerAccount, { 
      foreignKey: 'principalDispositionAccountId', 
      as: 'dispositionAccount' 
    });
    console.log('✅ TermDeposit ↔ CustomerAccount (source & disposition)');
  }

  if (TermDeposit && Customer) {
    TermDeposit.belongsTo(Customer, { 
      foreignKey: 'customerId', 
      targetKey: 'CUST_ID', 
      as: 'customer' 
    });
    Customer.hasMany(TermDeposit, { 
      foreignKey: 'customerId', 
      sourceKey: 'CUST_ID', 
      as: 'termDeposits' 
    });
    console.log('✅ TermDeposit ↔ Customer');
  }

  // ===== INTEREST DISTRIBUTION ASSOCIATIONS =====
  if (InterestDistribution && TermDeposit) {
    InterestDistribution.belongsTo(TermDeposit, { 
      foreignKey: 'termDepositId', 
      as: 'termDeposit' 
    });
    TermDeposit.hasMany(InterestDistribution, { 
      foreignKey: 'termDepositId', 
      as: 'interestDistributions' 
    });
    console.log('✅ InterestDistribution ↔ TermDeposit');
  }

  if (InterestDistribution && CustomerAccount) {
    InterestDistribution.belongsTo(CustomerAccount, { 
      foreignKey: 'targetAccountId', 
      as: 'targetAccount' 
    });
    CustomerAccount.hasMany(InterestDistribution, { 
      foreignKey: 'targetAccountId', 
      as: 'interestDistributions' 
    });
    console.log('✅ InterestDistribution ↔ CustomerAccount');
  }

  // ================================================================
  // ✅ LOAN PENALTY & PENALTY RULE ASSOCIATIONS
  // ================================================================
  
  // LoanPenalty ↔ LoanAccount
  if (LoanPenalty && LoanAccount) {
    LoanPenalty.belongsTo(LoanAccount, { 
      foreignKey: 'loan_id', 
      as: 'loan' 
    });
    LoanAccount.hasMany(LoanPenalty, { 
      foreignKey: 'loan_id', 
      as: 'penalties' 
    });
    console.log('✅ LoanPenalty ↔ LoanAccount');
  }

  // LoanPenalty ↔ PenaltyRule
  if (LoanPenalty && PenaltyRule) {
    LoanPenalty.belongsTo(PenaltyRule, { 
      foreignKey: 'penalty_rule_id', 
      as: 'penaltyRule' 
    });
    PenaltyRule.hasMany(LoanPenalty, { 
      foreignKey: 'penalty_rule_id', 
      as: 'penalties' 
    });
    console.log('✅ LoanPenalty ↔ PenaltyRule');
  }

  // LoanAccount ↔ PenaltyRule
  if (LoanAccount && PenaltyRule) {
    LoanAccount.belongsTo(PenaltyRule, { 
      foreignKey: 'penalty_rule_id', 
      as: 'penaltyRule' 
    });
    PenaltyRule.hasMany(LoanAccount, { 
      foreignKey: 'penalty_rule_id', 
      as: 'loans' 
    });
    console.log('✅ LoanAccount ↔ PenaltyRule');
  }

  // LoanAccount ↔ RepaymentSchedule
  if (LoanAccount && RepaymentSchedule) {
    LoanAccount.hasMany(RepaymentSchedule, { 
      foreignKey: 'loan_id', 
      as: 'repayment_schedules' 
    });
    RepaymentSchedule.belongsTo(LoanAccount, { 
      foreignKey: 'loan_id', 
      as: 'loan' 
    });
    console.log('✅ LoanAccount ↔ RepaymentSchedule');
  }

  // ================================================================
  // ✅ JOURNAL ENTRY ASSOCIATIONS
  // ================================================================

  // JournalEntry ↔ JournalEntryLine (one-to-many)
  if (JournalEntry && JournalEntryLine) {
    JournalEntry.hasMany(JournalEntryLine, {
      foreignKey: 'journalEntryId',
      as: 'lines',
      onDelete: 'CASCADE'
    });
    JournalEntryLine.belongsTo(JournalEntry, {
      foreignKey: 'journalEntryId',
      as: 'journalEntry'
    });
    console.log('✅ JournalEntry ↔ JournalEntryLine');
  }

  // JournalEntryLine ↔ GLAccount
  if (JournalEntryLine && GLAccount) {
    JournalEntryLine.belongsTo(GLAccount, {
      foreignKey: 'glAccountId',
      as: 'glAccount'
    });
    GLAccount.hasMany(JournalEntryLine, {
      foreignKey: 'glAccountId',
      as: 'journalLines'
    });
    console.log('✅ JournalEntryLine ↔ GLAccount');
  }

  // JournalEntry ↔ Transaction (optional link)
  if (JournalEntry && TransactionModel) {
    JournalEntry.belongsTo(TransactionModel, {
      foreignKey: 'transactionId',
      as: 'customerTransaction'
    });
    TransactionModel.hasMany(JournalEntry, {
      foreignKey: 'transactionId',
      as: 'journalEntries'
    });
    console.log('✅ JournalEntry ↔ Transaction');
  }

  // ================================================================
  // ✅ VAULT ASSOCIATIONS
  // ================================================================
  
  // Vault ↔ Drawer
  if (Vault && Drawer) {
    Vault.belongsTo(Drawer, { 
      foreignKey: 'drawer_id', 
      targetKey: 'DRAWER_ID',
      as: 'drawer' 
    });
    Drawer.hasOne(Vault, { 
      foreignKey: 'drawer_id', 
      sourceKey: 'DRAWER_ID',
      as: 'vault' 
    });
    console.log('✅ Vault ↔ Drawer');
  }

  // Vault ↔ Branch
  if (Vault && Branch) {
    Vault.belongsTo(Branch, { 
      foreignKey: 'branch_code', 
      targetKey: 'branchCode',
      as: 'branch' 
    });
    Branch.hasMany(Vault, { 
      foreignKey: 'branch_code', 
      sourceKey: 'branchCode',
      as: 'vaults' 
    });
    console.log('✅ Vault ↔ Branch');
  }

  // Vault ↔ User (created_by)
  if (Vault && User) {
    Vault.belongsTo(User, { 
      foreignKey: 'created_by', 
      targetKey: 'username',
      as: 'creator' 
    });
    User.hasMany(Vault, { 
      foreignKey: 'created_by', 
      sourceKey: 'username',
      as: 'createdVaults' 
    });
    console.log('✅ Vault ↔ User (creator)');
  }

  // VaultPersonnel ↔ Vault
  if (VaultPersonnel && Vault) {
    VaultPersonnel.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultPersonnel, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'personnel' 
    });
    console.log('✅ VaultPersonnel ↔ Vault');
  }

  // VaultPersonnel ↔ User
  if (VaultPersonnel && User) {
    VaultPersonnel.belongsTo(User, { 
      foreignKey: 'user_id', 
      targetKey: 'username',
      as: 'user' 
    });
    User.hasMany(VaultPersonnel, { 
      foreignKey: 'user_id', 
      sourceKey: 'username',
      as: 'vaultAssignments' 
    });
    console.log('✅ VaultPersonnel ↔ User');
  }

  // VaultApprovalRequest ↔ Vault
  if (VaultApprovalRequest && Vault) {
    VaultApprovalRequest.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultApprovalRequest, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'approvalRequests' 
    });
    console.log('✅ VaultApprovalRequest ↔ Vault');
  }

  // VaultApprovalRequest ↔ User (requester)
  if (VaultApprovalRequest && User) {
    VaultApprovalRequest.belongsTo(User, { 
      foreignKey: 'requested_by', 
      targetKey: 'username',
      as: 'requester' 
    });
    User.hasMany(VaultApprovalRequest, { 
      foreignKey: 'requested_by', 
      sourceKey: 'username',
      as: 'vaultRequests' 
    });
    console.log('✅ VaultApprovalRequest ↔ User (requester)');
  }

  // VaultApprovalRequest ↔ User (approver)
  if (VaultApprovalRequest && User) {
    VaultApprovalRequest.belongsTo(User, { 
      foreignKey: 'approved_by', 
      targetKey: 'username',
      as: 'approver' 
    });
    console.log('✅ VaultApprovalRequest ↔ User (approver)');
  }

  // VaultAuditLog ↔ Vault
  if (VaultAuditLog && Vault) {
    VaultAuditLog.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultAuditLog, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'auditLogs' 
    });
    console.log('✅ VaultAuditLog ↔ Vault');
  }

  // VaultMaintenanceLog ↔ Vault
  if (VaultMaintenanceLog && Vault) {
    VaultMaintenanceLog.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultMaintenanceLog, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'maintenanceLogs' 
    });
    console.log('✅ VaultMaintenanceLog ↔ Vault');
  }

  // VaultConfiguration ↔ Vault
  if (VaultConfiguration && Vault) {
    VaultConfiguration.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasOne(VaultConfiguration, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'configuration' 
    });
    console.log('✅ VaultConfiguration ↔ Vault');
  }

  // VaultAccessAttempt ↔ Vault
  if (VaultAccessAttempt && Vault) {
    VaultAccessAttempt.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultAccessAttempt, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'accessAttempts' 
    });
    console.log('✅ VaultAccessAttempt ↔ Vault');
  }

  // VaultAuthorizedPersonnel ↔ Vault
  if (VaultAuthorizedPersonnel && Vault) {
    VaultAuthorizedPersonnel.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultAuthorizedPersonnel, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'authorizedPersonnel' 
    });
    console.log('✅ VaultAuthorizedPersonnel ↔ Vault');
  }

  // VaultAuthorizedPersonnel ↔ User
  if (VaultAuthorizedPersonnel && User) {
    VaultAuthorizedPersonnel.belongsTo(User, { 
      foreignKey: 'user_id', 
      targetKey: 'username',
      as: 'authorizedUser' 
    });
    User.hasMany(VaultAuthorizedPersonnel, { 
      foreignKey: 'user_id', 
      sourceKey: 'username',
      as: 'vaultAuthorizations' 
    });
    console.log('✅ VaultAuthorizedPersonnel ↔ User');
  }

  // VaultTransaction ↔ Transaction
  if (VaultTransaction && TransactionModel) {
    VaultTransaction.belongsTo(TransactionModel, { 
      foreignKey: 'TRANSACTION_ID', 
      targetKey: 'id',
      as: 'transaction' 
    });
    TransactionModel.hasOne(VaultTransaction, { 
      foreignKey: 'TRANSACTION_ID', 
      sourceKey: 'id',
      as: 'vaultTransaction' 
    });
    console.log('✅ VaultTransaction ↔ Transaction');
  }

  // VaultTransaction ↔ Drawer (vault drawer)
  if (VaultTransaction && Drawer) {
    VaultTransaction.belongsTo(Drawer, { 
      foreignKey: 'VAULT_DRAWER_ID', 
      targetKey: 'DRAWER_ID',
      as: 'vaultDrawer' 
    });
    Drawer.hasMany(VaultTransaction, { 
      foreignKey: 'VAULT_DRAWER_ID', 
      sourceKey: 'DRAWER_ID',
      as: 'vaultTransactions' 
    });
    console.log('✅ VaultTransaction ↔ Drawer (vault drawer)');
  }

  // VaultTransaction ↔ Drawer (teller drawer)
  if (VaultTransaction && Drawer) {
    VaultTransaction.belongsTo(Drawer, { 
      foreignKey: 'TELLER_DRAWER_ID', 
      targetKey: 'DRAWER_ID',
      as: 'tellerDrawer' 
    });
    Drawer.hasMany(VaultTransaction, { 
      foreignKey: 'TELLER_DRAWER_ID', 
      sourceKey: 'DRAWER_ID',
      as: 'tellerVaultTransactions' 
    });
    console.log('✅ VaultTransaction ↔ Drawer (teller drawer)');
  }

  // VaultTransaction ↔ User (created_by)
  if (VaultTransaction && User) {
    VaultTransaction.belongsTo(User, { 
      foreignKey: 'CREATED_BY', 
      targetKey: 'username',
      as: 'creator' 
    });
    User.hasMany(VaultTransaction, { 
      foreignKey: 'CREATED_BY', 
      sourceKey: 'username',
      as: 'vaultTransactions' 
    });
    console.log('✅ VaultTransaction ↔ User (creator)');
  }

  // VaultTransaction ↔ User (authorized_by)
  if (VaultTransaction && User) {
    VaultTransaction.belongsTo(User, { 
      foreignKey: 'VAULT_AUTHORIZED_BY', 
      targetKey: 'username',
      as: 'authorizer' 
    });
    console.log('✅ VaultTransaction ↔ User (authorizer)');
  }

  // VaultPendingApproval ↔ Vault
  if (VaultPendingApproval && Vault) {
    VaultPendingApproval.belongsTo(Vault, { 
      foreignKey: 'vault_id', 
      targetKey: 'id',
      as: 'vault' 
    });
    Vault.hasMany(VaultPendingApproval, { 
      foreignKey: 'vault_id', 
      sourceKey: 'id',
      as: 'pendingApprovals' 
    });
    console.log('✅ VaultPendingApproval ↔ Vault');
  }

  // VaultPendingApproval ↔ User (requested_by)
  if (VaultPendingApproval && User) {
    VaultPendingApproval.belongsTo(User, { 
      foreignKey: 'requested_by', 
      targetKey: 'username',
      as: 'requester' 
    });
    User.hasMany(VaultPendingApproval, { 
      foreignKey: 'requested_by', 
      sourceKey: 'username',
      as: 'pendingApprovalRequests' 
    });
    console.log('✅ VaultPendingApproval ↔ User (requester)');
  }

  // VaultPendingApproval ↔ User (approved_by)
  if (VaultPendingApproval && User) {
    VaultPendingApproval.belongsTo(User, { 
      foreignKey: 'approved_by', 
      targetKey: 'username',
      as: 'approver' 
    });
    console.log('✅ VaultPendingApproval ↔ User (approver)');
  }

  // VaultApprovalRequiredRole ↔ VaultPendingApproval
  if (VaultApprovalRequiredRole && VaultPendingApproval) {
    VaultApprovalRequiredRole.belongsTo(VaultPendingApproval, {
      foreignKey: 'approval_id',
      targetKey: 'approval_id',
      as: 'approval'
    });
    VaultPendingApproval.hasMany(VaultApprovalRequiredRole, {
      foreignKey: 'approval_id',
      sourceKey: 'approval_id',
      as: 'requiredRoles'
    });
    console.log('✅ VaultApprovalRequiredRole ↔ VaultPendingApproval');
  }

  // VaultCurrentApprover ↔ VaultPendingApproval
  if (VaultCurrentApprover && VaultPendingApproval) {
    VaultCurrentApprover.belongsTo(VaultPendingApproval, {
      foreignKey: 'approval_id',
      targetKey: 'approval_id',
      as: 'approval'
    });
    VaultPendingApproval.hasMany(VaultCurrentApprover, {
      foreignKey: 'approval_id',
      sourceKey: 'approval_id',
      as: 'currentApprovers'
    });
    console.log('✅ VaultCurrentApprover ↔ VaultPendingApproval');
  }

  // VaultCurrentApprover ↔ User
  if (VaultCurrentApprover && User) {
    VaultCurrentApprover.belongsTo(User, {
      foreignKey: 'approver_id',
      targetKey: 'username',
      as: 'approver'
    });
    User.hasMany(VaultCurrentApprover, {
      foreignKey: 'approver_id',
      sourceKey: 'username',
      as: 'vaultApprovals'
    });
    console.log('✅ VaultCurrentApprover ↔ User');
  }

  // VaultEscalationHierarchy ↔ Vault
  if (VaultEscalationHierarchy && Vault) {
    VaultEscalationHierarchy.belongsTo(Vault, {
      foreignKey: 'vault_id',
      targetKey: 'id',
      as: 'vault'
    });
    Vault.hasMany(VaultEscalationHierarchy, {
      foreignKey: 'vault_id',
      sourceKey: 'id',
      as: 'escalationHierarchy'
    });
    console.log('✅ VaultEscalationHierarchy ↔ Vault');
  }

  // VaultRoleAccessMatrix ↔ Vault
  if (VaultRoleAccessMatrix && Vault) {
    VaultRoleAccessMatrix.belongsTo(Vault, {
      foreignKey: 'vault_id',
      targetKey: 'id',
      as: 'vault'
    });
    Vault.hasMany(VaultRoleAccessMatrix, {
      foreignKey: 'vault_id',
      sourceKey: 'id',
      as: 'roleAccessMatrix'
    });
    console.log('✅ VaultRoleAccessMatrix ↔ Vault');
  }

  
// ================================================================
// ✅ CARD APPROVAL ASSOCIATIONS
// ================================================================

// CardApprovalRequest ↔ Customer
if (CardApprovalRequest && Customer) {
  CardApprovalRequest.belongsTo(Customer, {
    foreignKey: 'customerId',
    targetKey: 'CUST_ID',
    as: 'customer'
  });
  Customer.hasMany(CardApprovalRequest, {
    foreignKey: 'customerId',
    sourceKey: 'CUST_ID',
    as: 'cardApprovalRequests'
  });
  console.log('✅ CardApprovalRequest ↔ Customer');
}

// CardApprovalRequest ↔ CustomerAccount
if (CardApprovalRequest && CustomerAccount) {
  CardApprovalRequest.belongsTo(CustomerAccount, {
    foreignKey: 'accountId',
    targetKey: 'id',
    as: 'account'
  });
  CustomerAccount.hasMany(CardApprovalRequest, {
    foreignKey: 'accountId',
    sourceKey: 'id',
    as: 'cardApprovalRequests'
  });
  console.log('✅ CardApprovalRequest ↔ CustomerAccount');
}

// CardApprovalRequest ↔ User (requester)
if (CardApprovalRequest && User) {
  CardApprovalRequest.belongsTo(User, {
    foreignKey: 'requestedBy',
    targetKey: 'id',
    as: 'requester'
  });
  User.hasMany(CardApprovalRequest, {
    foreignKey: 'requestedBy',
    sourceKey: 'id',
    as: 'requestedCardApprovals'
  });
  console.log('✅ CardApprovalRequest ↔ User (requester)');
}

// CardApprovalRequest ↔ User (approver)
if (CardApprovalRequest && User) {
  CardApprovalRequest.belongsTo(User, {
    foreignKey: 'approvedBy',
    targetKey: 'id',
    as: 'approver'
  });
  User.hasMany(CardApprovalRequest, {
    foreignKey: 'approvedBy',
    sourceKey: 'id',
    as: 'approvedCardApprovals'
  });
  console.log('✅ CardApprovalRequest ↔ User (approver)');
}

// CardApprovalRequest ↔ Role (requestedByRole) - ✅ Using role_id
if (CardApprovalRequest && Role) {
  CardApprovalRequest.belongsTo(Role, {
    foreignKey: 'requestedByRoleId',
    targetKey: 'role_id',
    as: 'requesterRole'
  });
  console.log('✅ CardApprovalRequest ↔ Role (requesterRole)');
}

// CardApprovalRequest ↔ Role (approvedByRole) - ✅ Using role_id
if (CardApprovalRequest && Role) {
  CardApprovalRequest.belongsTo(Role, {
    foreignKey: 'approvedByRoleId',
    targetKey: 'role_id',
    as: 'approverRole'
  });
  console.log('✅ CardApprovalRequest ↔ Role (approverRole)');
}

// CardApprovalRequest ↔ DebitCard (existingCard)
if (CardApprovalRequest && DebitCard) {
  CardApprovalRequest.belongsTo(DebitCard, {
    foreignKey: 'existingCardId',
    targetKey: 'id',
    as: 'existingCard'
  });
  console.log('✅ CardApprovalRequest ↔ DebitCard (existingCard)');
}

// CardApprovalRequest ↔ ApprovalWorkflowConfig
if (CardApprovalRequest && ApprovalWorkflowConfig) {
  CardApprovalRequest.belongsTo(ApprovalWorkflowConfig, {
    foreignKey: 'workflowConfigId',
    targetKey: 'id',
    as: 'workflowConfig'
  });
  ApprovalWorkflowConfig.hasMany(CardApprovalRequest, {
    foreignKey: 'workflowConfigId',
    sourceKey: 'id',
    as: 'approvalRequests'
  });
  console.log('✅ CardApprovalRequest ↔ ApprovalWorkflowConfig');
}
  // ================================================================
  // ✅ EMTL ASSOCIATIONS
  // ================================================================

  // EMTLAuditLog ↔ EMTLPolicy
  if (EMTLAuditLog && EMTLPolicy) {
    EMTLAuditLog.belongsTo(EMTLPolicy, {
      foreignKey: 'POLICY_ID',
      targetKey: 'id',
      as: 'policy'
    });
    EMTLPolicy.hasMany(EMTLAuditLog, {
      foreignKey: 'POLICY_ID',
      sourceKey: 'id',
      as: 'auditLogs'
    });
    console.log('✅ EMTLAuditLog ↔ EMTLPolicy');
  }

  // EMTLTransaction ↔ EMTLPolicy (via GL_ACCOUNT reference - loose coupling)
  if (EMTLTransaction && EMTLPolicy) {
    console.log('✅ EMTLTransaction ↔ EMTLPolicy (logical reference via GL_ACCOUNT)');
  }

  // EMTLTransaction ↔ RemittanceBatch
  if (EMTLTransaction && RemittanceBatch) {
    EMTLTransaction.belongsTo(RemittanceBatch, {
      foreignKey: 'REMITTANCE_BATCH_ID',
      targetKey: 'BATCH_ID',
      as: 'remittanceBatch'
    });
    RemittanceBatch.hasMany(EMTLTransaction, {
      foreignKey: 'REMITTANCE_BATCH_ID',
      sourceKey: 'BATCH_ID',
      as: 'transactions'
    });
    console.log('✅ EMTLTransaction ↔ RemittanceBatch');
  }

  // EMTLTransaction ↔ Customer (logical reference)
  if (EMTLTransaction && Customer) {
    console.log('✅ EMTLTransaction ↔ Customer (logical reference via CUSTOMER_NO)');
  }

  // EMTLTransaction ↔ Account (logical reference)
  if (EMTLTransaction && Account) {
    console.log('✅ EMTLTransaction ↔ Account (logical reference via ACCOUNT_NO)');
  }

  // ================================================================
  // ✅ INWARD TRANSFER ASSOCIATIONS - CORRECTED
  // ================================================================

  // PendingTransfer ↔ Customer (when matched)
  if (PendingTransfer && Customer) {
    PendingTransfer.belongsTo(Customer, {
      foreignKey: 'matched_to_customer_id',
      targetKey: 'id',
      as: 'matchedCustomer'
    });
    Customer.hasMany(PendingTransfer, {
      foreignKey: 'matched_to_customer_id',
      sourceKey: 'id',
      as: 'pendingTransfers'
    });
    console.log('✅ PendingTransfer ↔ Customer');
  }

  // PendingTransfer ↔ InwardFundsTransfer
  if (PendingTransfer && InwardFundsTransfer) {
    PendingTransfer.belongsTo(InwardFundsTransfer, {
      foreignKey: 'inward_transfer_id',
      targetKey: 'id',
      as: 'inwardTransfer'
    });
    InwardFundsTransfer.hasMany(PendingTransfer, {
      foreignKey: 'inward_transfer_id',
      sourceKey: 'id',
      as: 'pendingTransfers'
    });
    console.log('✅ PendingTransfer ↔ InwardFundsTransfer');
  }

  // PendingTransfer ↔ PendingInwardTransaction
  if (PendingTransfer && PendingInwardTransaction) {
    PendingTransfer.belongsTo(PendingInwardTransaction, {
      foreignKey: 'pending_inward_id',
      targetKey: 'id',
      as: 'pendingInward'
    });
    PendingInwardTransaction.hasMany(PendingTransfer, {
      foreignKey: 'pending_inward_id',
      sourceKey: 'id',
      as: 'pendingTransfers'
    });
    console.log('✅ PendingTransfer ↔ PendingInwardTransaction');
  }

  // PaystackTransaction ↔ CustomerAccount
  if (PaystackTransaction && CustomerAccount) {
    PaystackTransaction.belongsTo(CustomerAccount, {
      foreignKey: 'customer_account',
      targetKey: 'account_number',
      as: 'customerAccount'
    });
    CustomerAccount.hasMany(PaystackTransaction, {
      foreignKey: 'customer_account',
      sourceKey: 'account_number',
      as: 'paystackTransactions'
    });
    console.log('✅ PaystackTransaction ↔ CustomerAccount');
  }

  // PaystackTransaction ↔ InwardFundsTransfer
  if (PaystackTransaction && InwardFundsTransfer) {
    PaystackTransaction.belongsTo(InwardFundsTransfer, {
      foreignKey: 'inward_transfer_id',
      targetKey: 'id',
      as: 'inwardTransfer'
    });
    InwardFundsTransfer.hasMany(PaystackTransaction, {
      foreignKey: 'inward_transfer_id',
      sourceKey: 'id',
      as: 'paystackTransactions'
    });
    console.log('✅ PaystackTransaction ↔ InwardFundsTransfer');
  }

  // PaymentReference ↔ Customer
  if (PaymentReference && Customer) {
    PaymentReference.belongsTo(Customer, {
      foreignKey: 'customer_id',
      targetKey: 'id',
      as: 'customer'
    });
    Customer.hasMany(PaymentReference, {
      foreignKey: 'customer_id',
      sourceKey: 'id',
      as: 'paymentReferences'
    });
    console.log('✅ PaymentReference ↔ Customer');
  }

  // PaymentReference ↔ CustomerAccount
  if (PaymentReference && CustomerAccount) {
    PaymentReference.belongsTo(CustomerAccount, {
      foreignKey: 'customer_account',
      targetKey: 'account_number',
      as: 'account'
    });
    CustomerAccount.hasMany(PaymentReference, {
      foreignKey: 'customer_account',
      sourceKey: 'account_number',
      as: 'paymentReferences'
    });
    console.log('✅ PaymentReference ↔ CustomerAccount');
  }

  // InwardFundsTransfer ↔ CustomerAccount
  if (InwardFundsTransfer && CustomerAccount) {
    InwardFundsTransfer.belongsTo(CustomerAccount, {
      foreignKey: 'BENEFICIARY_ACCT',
      targetKey: 'account_number',
      as: 'beneficiaryAccount'
    });
    CustomerAccount.hasMany(InwardFundsTransfer, {
      foreignKey: 'BENEFICIARY_ACCT',
      sourceKey: 'account_number',
      as: 'inwardTransfers'
    });
    console.log('✅ InwardFundsTransfer ↔ CustomerAccount');
  }

  // InwardFundsTransfer ↔ PendingInwardTransaction
  if (InwardFundsTransfer && PendingInwardTransaction) {
    InwardFundsTransfer.hasMany(PendingInwardTransaction, {
      foreignKey: 'INWD_FUNDS_XFER_ID',
      sourceKey: 'id',
      as: 'pendingInwardTransactions'
    });
    PendingInwardTransaction.belongsTo(InwardFundsTransfer, {
      foreignKey: 'INWD_FUNDS_XFER_ID',
      targetKey: 'id',
      as: 'inwardFundsTransfer'
    });
    console.log('✅ InwardFundsTransfer ↔ PendingInwardTransaction');
  }

  console.log('✅ All associations setup complete!');
}
setupAssociations();

// Add to your sync function
const syncModels = async () => {
  try {
    // Sync models in order
    await EOYReport.sync({ alter: true });
    console.log('✅ EOYReport table synced');
    
    await GLClosingPeriod.sync({ alter: true });
    console.log('✅ GLClosingPeriod table synced');
  } catch (error) {
    console.error('❌ Error syncing EOY models:', error);
  }
};

// Call the sync function when your app starts
syncModels();

// ========== GETTERS ==========
export const getModel = (modelName) => models[modelName];

// Admin
export const getAdminUser = () => models.AdminUser;
export const getAdminService = () => models.AdminService;

// Module Management
export const getModule = () => models.Module;
export const getRoleModule = () => models.RoleModule;

// Loan Provision
export const getLoanProvision = () => models.LoanProvision;

// Interest Distribution
export const getInterestDistribution = () => models.InterestDistribution;

// Term Deposit
export const getTermDeposit = () => models.TermDeposit;

// Deposit Account Interest Tier
export const getDepositAccountInterestTier = () => models.DepositAccountInterest_Tier;

// Penalty
export const getPenaltyRule = () => models.PenaltyRule;
export const getLoanPenalty = () => models.LoanPenalty;

// ================================================================
// ✅ USER SESSION & ACTIVITY LOG GETTERS
// ================================================================
export const getUserSession = () => models.UserSession;
export const getUserActivityLog = () => models.UserActivityLog;

// ================================================================
// ✅ VAULT GETTERS
// ================================================================
export const getVault = () => models.Vault;
export const getVaultPersonnel = () => models.VaultPersonnel;
export const getVaultApprovalRequest = () => models.VaultApprovalRequest;
export const getVaultAuditLog = () => models.VaultAuditLog;
export const getVaultMaintenanceLog = () => models.VaultMaintenanceLog;
export const getVaultConfiguration = () => models.VaultConfiguration;
export const getVaultAccessAttempt = () => models.VaultAccessAttempt;
export const getVaultAuthorizedPersonnel = () => models.VaultAuthorizedPersonnel;
export const getVaultTransaction = () => models.VaultTransaction;
export const getVaultPendingApproval = () => models.VaultPendingApproval;
export const getVaultApprovalRequiredRole = () => models.VaultApprovalRequiredRole;
export const getVaultCurrentApprover = () => models.VaultCurrentApprover;
export const getVaultEscalationHierarchy = () => models.VaultEscalationHierarchy;
export const getVaultRoleAccessMatrix = () => models.VaultRoleAccessMatrix;

// ================================================================
// ✅ EMTL GETTERS
// ================================================================
export const getEMTLPolicy = () => models.EMTLPolicy;
export const getEMTLAuditLog = () => models.EMTLAuditLog;
export const getEMTLTransaction = () => models.EMTLTransaction;
export const getRemittanceBatch = () => models.RemittanceBatch;

// ================================================================
// EOY REPORT GETTERS
// ================================================================
export const getEOYReport = () => models.EOYReport;
export const getGLClosingPeriod = () => models.GLClosingPeriod;  



// ================================================================
// ✅ JOURNAL ENTRY GETTERS
// ================================================================
export const getJournalEntry = () => models.JournalEntry;
export const getJournalEntryLine = () => models.JournalEntryLine;

// ================================================================
// ✅ INWARD TRANSFER GETTERS
// ================================================================
export const getInwardFundsTransfer = () => models.InwardFundsTransfer;
export const getPendingInwardTransaction = () => models.PendingInwardTransaction;
export const getPendingTransfer = () => models.PendingTransfer;
export const getPaystackTransaction = () => models.PaystackTransaction;
export const getPaymentReference = () => models.PaymentReference;

// Existing getters (partial list – all remain)
export const getAccount = () => models.Account;
export const getAccountApplication = () => models.AccountApplication;
export const getAML = () => models.AML;
export const getAMLThreshold = () => models.AMLThreshold;
export const getAuditTrail = () => models.AuditTrail;
export const getAutoReclassifyInformation = () => models.AutoReclassifyInformation;
export const getBank = () => models.Bank;
export const getBinInfo = () => models.BinInfo;
export const getBranch = () => models.Branch;
export const getBusinessRole = () => models.BusinessRole;
export const getBusinessUnit = () => models.BusinessUnit;
export const getCardCounter = () => models.CardCounter;
export const getCardSettlementConfig = () => models.CardSettlementConfig;
export const getCashWithdrawalTransaction = () => models.CashWithdrawalTransaction;
export const getChartofAccount = () => models.ChartofAccount;
export const getCollection = () => models.Collection;
export const getConfigurationService = () => models.ConfigurationService;
export const getCountry = () => models.Country;
export const getCounter = () => models.Counter;
export const getCreditApplication = () => models.CreditApplication;
export const getCustomer = () => models.Customer;
export const getCustomerAccount = () => models.CustomerAccount;
export const getCustomerType = () => models.CustomerType;
export const getDebitCard = () => models.DebitCard;
export const getDeposit = () => models.Deposit;
export const getDepositAccountApplication = () => models.DepositAccountApplication;
export const getDepositAccountInterest = () => models.DepositAccountInterest;
export const getDepositTransaction = () => models.DepositTransaction;
export const getDirectDebit = () => models.DirectDebit;
export const getDirectDebitRequest = () => models.DirectDebitRequest;
export const getDrawer = () => models.Drawer;
export const getDrawerCloseOut = () => models.DrawerCloseOut;
export const getDrawerCurrency = () => models.DrawerCurrency;
export const getDrawerCurrencyDenomination = () => models.DrawerCurrencyDenomination;
export const getDrawerUserRole = () => models.DrawerUserRole;
export const getEvent = () => models.Event;
export const getGLAccount = () => models.GLAccount;
export const getGLAccountCategory = () => models.GLAccountCategory;
export const getGLClosingPeriods = () => models.GLClosingPeriods;
export const getGLAccountTransaction = () => models.GLAccountTransaction;
export const getGroup = () => models.Group;
export const getGroupSavings = () => models.GroupSavings;
export const getGuarantor = () => models.Guarantor;
export const getGuarantorAudit = () => models.GuarantorAudit;
export const getHoliday = () => models.Holiday;
export const getIdentificationInformation = () => models.IdentificationInformation;
export const getLedger = () => models.Ledger;
export const getLicense = () => models.License;
export const getLoanAccount = () => models.LoanAccount;
export const getLoanAccountSummary = () => models.LoanAccountSummary;
export const getLoanContractForm = () => models.LoanContractForm;
export const getLoanDisbursement = () => models.LoanDisbursement;
export const getLoanFee = () => models.LoanFee;
export const getLoanInterestRate = () => models.LoanInterestRate;
export const getLoanPortfolio = () => models.LoanPortfolio;
export const getLoanProduct = () => models.LoanProduct;
export const getLoanRepayment = () => models.LoanRepayment;
export const getLoanRepaymentHistory = () => models.LoanRepaymentHistory;
export const getLoanRepaymentTransaction = () => models.LoanRepaymentTransaction;
export const getLoginPolicy = () => models.LoginPolicy;
export const getNextOfKin = () => models.NextOfKin;
export const getNotification = () => models.Notification;
export const getOrganization = () => models.Organization;
export const getOverdueLoan = () => models.OverdueLoan;
export const getPermissions = () => models.Permissions;
export const getProductTypeMapping = () => models.ProductTypeMapping;
export const getRateIndex = () => models.RateIndex;
export const getRelationshipOfficer = () => models.RelationshipOfficer;
export const getRepaymentSchedule = () => models.RepaymentSchedule;
export const getRole = () => models.Role;
export const getSMS = () => models.SMS;
export const getSavingsProduct = () => models.SavingsProduct;
export const getScheduledTask = () => models.ScheduledTask;
export const getStandingOrder = () => models.StandingOrder;
export const getState = () => models.State;
export const getSubfolder = () => models.Subfolder;
export const getSystemConfig = () => models.SystemConfig;
export const getSystemDate = () => models.SystemDate;
export const getThrift = () => models.Thrift;
export const getThriftSettings = () => models.ThriftSettings;
export const getTransaction = () => models.Transaction;
export const getTransactionPolicy = () => models.TransactionPolicy;
export const getUser = () => models.User;
export const getUserRole = () => models.UserRole;
export const getWF_WORK_ITEM = () => models.WF_WORK_ITEM;
export const getLoanEvent = () => models.LoanEvent;
export const getCharge = () => models.Charge;
export const getAdminPlugin = () => models.AdminPlugin;

// ========== INITIALISE ==========
let initialized = false;

export const initializeModels = async () => {
  if (initialized) {
    console.log('📦 Models already initialized');
    return models;
  }
  initialized = true;
  console.log('🎉 All models initialized successfully!');
  const availableModels = Object.keys(models).filter(
    k => !['sequelize', 'Op', 'DataTypes', 'QueryTypes'].includes(k) && models[k] !== null
  );
  console.log('📊 Available models:', availableModels.join(', '));
  return models;
};

// ================================================================
// ✅ SYNC ALL TABLES - Creates missing tables and columns
// ================================================================
export const syncAllTables = async (options = {}) => {
  try {
    const { force = false, alter = true } = options;
    
    console.log('\n📦 Syncing all tables with database...');
    console.log(`   Force: ${force}, Alter: ${alter}`);
    
    // Get all model names (exclude non-model properties)
    const modelKeys = Object.keys(models).filter(
      k => !['sequelize', 'Op', 'DataTypes', 'QueryTypes'].includes(k) && models[k] !== null
    );
    
    console.log(`📊 Found ${modelKeys.length} models to sync`);
    
    // Disable foreign key checks temporarily
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Sync each model individually
    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const key of modelKeys) {
      const model = models[key];
      if (model && typeof model.sync === 'function') {
        try {
          await model.sync({ alter, force });
          console.log(`✅ Table ${model.tableName || key} synced successfully`);
          syncedCount++;
        } catch (err) {
          console.error(`❌ Failed to sync ${key}:`, err.message);
          errorCount++;
          errors.push({ model: key, error: err.message });
        }
      }
    }
    
    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log(`\n✅ Sync complete! Synced: ${syncedCount}, Errors: ${errorCount}`);
    
    if (errors.length > 0) {
      console.log('⚠️ Errors encountered:');
      errors.forEach(({ model, error }) => {
        console.log(`   - ${model}: ${error}`);
      });
    }
    
    return { success: true, syncedCount, errorCount, errors };
    
  } catch (error) {
    console.error('❌ Error syncing tables:', error.message);
    // Ensure foreign key checks are re-enabled
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (e) {
      // Ignore
    }
    return { success: false, error: error.message };
  }
};

// ========== CREATE ALL TABLES (Alias) ==========
export const createAllTables = async (options = {}) => {
  return syncAllTables(options);
};

// ========== INITIALIZE EMTL TABLES ==========
export const initializeEMTLTables = async () => {
  try {
    if (models.EMTLPolicy && typeof models.EMTLPolicy.initializeTable === 'function') {
      await models.EMTLPolicy.initializeTable();
    }
    if (models.EMTLAuditLog && typeof models.EMTLAuditLog.initializeTable === 'function') {
      await models.EMTLAuditLog.initializeTable();
    }
    if (models.EMTLTransaction && typeof models.EMTLTransaction.initializeTable === 'function') {
      await models.EMTLTransaction.initializeTable();
    }
    if (models.RemittanceBatch && typeof models.RemittanceBatch.initializeTable === 'function') {
      await models.RemittanceBatch.initializeTable();
    }
    
    console.log('✅ All EMTL tables initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing EMTL tables:', error.message);
    return false;
  }
};

// ========== NAMED EXPORTS ==========
export {
  Account,
  AccountApplication,
  AdminUser,
  AdminService,
  AML,
  AMLThreshold,
  AuditTrail,
  AutoReclassifyInformation,
  Bank,
  BinInfo,
  Branch,
  BusinessRole,
  BusinessUnit,
  CardCounter,
  CardSettlementConfig,
  CashWithdrawalTransaction,
  Charge,
  ChargeTier,
  ChartofAccount,
  Collection,
  ConfigurationService,
  Country,
  Counter,
  CreditApplication,
  Customer,
  CustomerAccount,
  CustomerType,
  DebitCard,
  Deposit,
  DepositAccountApplication,
  DepositAccountInterest,
  DepositAccountInterest_Tier,
  DepositTransaction,
  DirectDebit,
  DirectDebitRequest,
  Drawer,
  DrawerCloseOut,
  DrawerCurrency,
  DrawerCurrencyDenomination,
  DrawerUserRole,
  Event,
  GLAccount,
  GLAccountCategory,
  GLClosingPeriods,
  GLAccountTransaction,
  Group,
  GroupSavings,
  Guarantor,
  GuarantorAudit,
  Holiday,
  IdentificationInformation,
  InterestAccrual,
  InterestDistribution,
  License,
  LoanAccount,
  LoanAccountSummary,
  LoanContractForm,
  LoanDisbursement,
  LoanFee,
  LoanInterestRate,
  LoanPenalty,
  LoanPortfolio,
  LoanProduct,
  LoanProvision,
  LoanRepayment,
  LoanRepaymentHistory,
  LoanRepaymentTransaction,
  LoginPolicy,
  NextOfKin,
  Organization,
  OverdueLoan,
  PenaltyRule,
  Permissions,
  ProductTypeMapping,
  RateIndex,
  RelationshipOfficer,
  RepaymentSchedule,
  Role,
  SMS,
  SavingsProduct,
  ScheduledTask,
  StandingOrder,
  State,
  Subfolder,
  SystemConfig,
  SystemDate,
  TermDeposit,
  Thrift,
  ThriftSettings,
  Transaction,
  TransactionPolicy,
  User,
  UserRole,
  WF_WORK_ITEM,
  LoanEvent,
  Ledger,
  Module,
  Notification,
  RoleModule,
  AdminPlugin,
  // ================================================================
  // ✅ USER SESSION & ACTIVITY LOG EXPORTS
  // ================================================================
  UserSession,
  UserActivityLog,
  // ================================================================
  // ✅ VAULT EXPORTS - All class-based models
  // ================================================================
  Vault,
  VaultPersonnel,
  VaultApprovalRequest,
  VaultAuditLog,
  VaultMaintenanceLog,
  VaultConfiguration,
  VaultAccessAttempt,
  VaultAuthorizedPersonnel,
  VaultTransaction,
  VaultPendingApproval,
  VaultApprovalRequiredRole,
  VaultCurrentApprover,
  VaultEscalationHierarchy,
  VaultRoleAccessMatrix,
  // ================================================================
  // ✅ EMTL EXPORTS
  // ================================================================
  EMTLPolicy,
  EMTLAuditLog,
  EMTLTransaction,
  RemittanceBatch,
  // ================================================================
  // ✅ JOURNAL ENTRY EXPORTS
  // ================================================================
  JournalEntry,
  JournalEntryLine,
  // ================================================================
  // ✅ INWARD TRANSFER EXPORTS
  // ================================================================
  InwardFundsTransfer,
  PendingInwardTransaction,
  PendingTransfer,
  PaystackTransaction,
  PaymentReference,
  // ================================================================
    // ✅ CARD APPROVAL MODELS
    // ================================================================
    CardApprovalRequest,
    ApprovalWorkflowConfig,

};

export default models;