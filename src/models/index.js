// src/models/index.js – FINAL STABLE VERSION (includes InterestAccrual)
import sequelize from '../../config/db.js';
import { DataTypes, Op, QueryTypes } from 'sequelize';

console.log('📦 Starting model imports (static)...');

// ========== STATIC IMPORTS ==========
import Account from './Accounts.js';
import AccountApplication from './AccountApplication.js';
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
import InterestAccrual from './InterestAccrual.js';      // ✅ ADDED
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

// ========== initModel helper (unchanged) ==========
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
  { key: 'InterestAccrual', def: InterestAccrual },          // ✅ ADDED
  { key: 'License', def: License },
  { key: 'LoanAccount', def: LoanAccount },
  { key: 'LoanAccountSummary', def: LoanAccountSummary },
  { key: 'LoanContractForm', def: LoanContractForm },
  { key: 'LoanFee', def: LoanFee },
  { key: 'LoanInterestRate', def: LoanInterestRate },
  { key: 'LoanPenalty', def: LoanPenalty },
  { key: 'LoanPortfolio', def: LoanPortfolio },
  { key: 'LoanProduct', def: LoanProduct },
  { key: 'LoanRepayment', def: LoanRepayment },
  { key: 'LoanRepaymentHistory', def: LoanRepaymentHistory },
  { key: 'LoanRepaymentTransaction', def: LoanRepaymentTransaction },
  { key: 'LoginPolicy', def: LoginPolicy },
  { key: 'NextOfKin', def: NextOfKin },
  { key: 'Organization', def: Organization },
  { key: 'OverdueLoan', def: OverdueLoan },
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
  const { StandingOrder, CustomerAccount, DebitCard, Account, CardSettlementConfig, LoanEvent } = models;

  if (StandingOrder && CustomerAccount) {
    StandingOrder.belongsTo(CustomerAccount, { foreignKey: 'customerAcctNo', targetKey: 'account_number', as: 'customerAccount' });
    CustomerAccount.hasMany(StandingOrder, { foreignKey: 'customerAcctNo', sourceKey: 'account_number', as: 'standingOrders' });
    console.log('✅ StandingOrder ↔ CustomerAccount');
  }
  if (DebitCard && CustomerAccount) {
    DebitCard.belongsTo(CustomerAccount, { foreignKey: 'account_id', as: 'customerAccount' });
    CustomerAccount.hasMany(DebitCard, { foreignKey: 'account_id', as: 'debitCards' });
    console.log('✅ DebitCard ↔ CustomerAccount');
  }
  if (DebitCard && Account) {
    DebitCard.belongsTo(Account, { foreignKey: 'account_id', as: 'operationalAccount' });
    console.log('✅ DebitCard ↔ Account');
  }
  if (CardSettlementConfig && Account) {
    CardSettlementConfig.belongsTo(Account, { as: 'operationalAccount', foreignKey: 'operational_account_id' });
    Account.hasOne(CardSettlementConfig, { foreignKey: 'operational_account_id', as: 'settlementConfig' });
    console.log('✅ CardSettlementConfig ↔ Account');
  }
  if (LoanEvent && typeof LoanEvent.associate === 'function') LoanEvent.associate(models);
}
setupAssociations();

// ========== GETTERS ==========
export const getModel = (modelName) => models[modelName];
export const getInterestAccrual = () => models.InterestAccrual;   // ✅ ADDED
// other getters are unchanged and already defined below
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
export const getCharge = () => models.Charge;
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
export const getLoanPenalty = () => models.LoanPenalty;
export const getLoanPortfolio = () => models.LoanPortfolio;
export const getLoanProduct = () => models.LoanProduct;
export const getLoanRepayment = () => models.LoanRepayment;
export const getLoanRepaymentHistory = () => models.LoanRepaymentHistory;
export const getLoanRepaymentTransaction = () => models.LoanRepaymentTransaction;
export const getLoginPolicy = () => models.LoginPolicy;
export const getNextOfKin = () => models.NextOfKin;
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
export const getTermDeposit = () => models.TermDeposit;
export const getThrift = () => models.Thrift;
export const getThriftSettings = () => models.ThriftSettings;
export const getTransaction = () => models.Transaction;
export const getTransactionPolicy = () => models.TransactionPolicy;
export const getUser = () => models.User;
export const getUserRole = () => models.UserRole;
export const getWF_WORK_ITEM = () => models.WF_WORK_ITEM;
export const getLoanEvent = () => models.LoanEvent;

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

// ========== NAMED EXPORTS ==========
export {
  Account,
  AccountApplication,
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
  InterestAccrual,      // ✅ EXPORTED
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
  LoanRepayment,
  LoanRepaymentHistory,
  LoanRepaymentTransaction,
  LoginPolicy,
  NextOfKin,
  Organization,
  OverdueLoan,
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
};

export default models;