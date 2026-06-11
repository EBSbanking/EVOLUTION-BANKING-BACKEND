// models/DepositAccountInterestOption.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterestOption extends Model {
  static async findByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { depositAcctId: depositAccountId },
      order: [['createDate', 'DESC']]
    });
  }

  static async findActiveByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { depositAcctId: depositAccountId, recStatus: 'A' },
      order: [['createDate', 'DESC']]
    });
  }

  static async findBySettlementAccounts(crAccountId, drAccountId) {
    return this.findAll({
      where: {
        crSettlementAcctId: crAccountId,
        drSettlementAcctId: drAccountId,
        recStatus: 'A'
      }
    });
  }

  static async findByCreatedBy(createdBy) {
    return this.findAll({
      where: { createdBy: createdBy },
      order: [['createDate', 'DESC']]
    });
  }

  static async getOptionsSummary(depositAccountId = null) {
    const whereClause = depositAccountId ? { depositAcctId: depositAccountId } : {};
    const options = await this.findAll({
      where: whereClause,
      order: [['depositAcctId', 'ASC'], ['createDate', 'DESC']]
    });

    const summary = {
      totalOptions: options.length,
      activeOptions: options.filter(o => o.recStatus === 'A').length,
      inactiveOptions: options.filter(o => o.recStatus === 'I').length,
      bySettlementType: {
        credit: options.filter(o => o.crSettlementOptionCode).length,
        debit: options.filter(o => o.drSettlementOptionCode).length,
        charge: options.filter(o => o.chargeSettlementOptionCode).length
      },
      byDepositAccount: {}
    };

    options.forEach(option => {
      const accountId = option.depositAcctId;
      if (!summary.byDepositAccount[accountId]) {
        summary.byDepositAccount[accountId] = {
          total: 0, active: 0,
          creditOptions: 0, debitOptions: 0, chargeOptions: 0
        };
      }
      summary.byDepositAccount[accountId].total++;
      if (option.recStatus === 'A') summary.byDepositAccount[accountId].active++;
      if (option.crSettlementOptionCode) summary.byDepositAccount[accountId].creditOptions++;
      if (option.drSettlementOptionCode) summary.byDepositAccount[accountId].debitOptions++;
      if (option.chargeSettlementOptionCode) summary.byDepositAccount[accountId].chargeOptions++;
    });
    return summary;
  }

  static async validateSettlementOptions(depositAccountId, options) {
    const errors = [];
    const existingOptions = await this.findActiveByDepositAccountId(depositAccountId);
    if (existingOptions.length > 0 && options.recStatus === 'A') {
      const duplicate = existingOptions.find(opt =>
        opt.crSettlementAcctId === options.crSettlementAcctId &&
        opt.drSettlementAcctId === options.drSettlementAcctId &&
        opt.chargeSettlementAcctId === options.chargeSettlementAcctId
      );
      if (duplicate) errors.push('Duplicate active settlement options already exist for this account');
    }
    if (options.crSettlementOptionCode && !options.crSettlementAcctId)
      errors.push('Credit settlement account ID is required when credit settlement option is provided');
    if (options.drSettlementOptionCode && !options.drSettlementAcctId)
      errors.push('Debit settlement account ID is required when debit settlement option is provided');
    if (options.chargeSettlementOptionCode && !options.chargeSettlementAcctId)
      errors.push('Charge settlement account ID is required when charge settlement option is provided');
    return { isValid: errors.length === 0, errors };
  }

  getOptionDetails() {
    return {
      optionId: this.id,
      depositAccountId: this.depositAcctId,
      creditSettlement: {
        accountId: this.crSettlementAcctId,
        optionCode: this.crSettlementOptionCode,
        accountNumber: this.crSettlementAccountNumber,
        customerName: this.crSettlementCustomerName,
        bicId: this.crSettlementBicId
      },
      debitSettlement: {
        accountId: this.drSettlementAcctId,
        optionCode: this.drSettlementOptionCode,
        accountNumber: this.drSettlementAccountNumber,
        customerName: this.drSettlementCustomerName,
        bicId: this.drSettlementBicId
      },
      chargeSettlement: {
        accountId: this.chargeSettlementAcctId,
        optionCode: this.chargeSettlementOptionCode,
        accountNumber: this.chargeSettlementAccountNumber,
        customerName: this.chargeSettlementCustomerName,
        bicId: this.chargeSettlementBicId
      },
      status: this.recStatus,
      version: this.versionNo,
      createdBy: this.createdBy,
      createdDate: this.createDate,
      userId: this.userId,
      systemCreateTimestamp: this.systemCreateTimestamp,
      rowTimestamp: this.rowTimestamp
    };
  }

  isActive() { return this.recStatus === 'A'; }
  hasCreditSettlement() { return !!this.crSettlementOptionCode; }
  hasDebitSettlement() { return !!this.drSettlementOptionCode; }
  hasChargeSettlement() { return !!this.chargeSettlementOptionCode; }

  get settlementSummary() {
    const settlements = [];
    if (this.hasCreditSettlement()) {
      settlements.push({
        type: 'Credit',
        account: this.crSettlementAccountNumber,
        customer: this.crSettlementCustomerName,
        option: this.crSettlementOptionCode
      });
    }
    if (this.hasDebitSettlement()) {
      settlements.push({
        type: 'Debit',
        account: this.drSettlementAccountNumber,
        customer: this.drSettlementCustomerName,
        option: this.drSettlementOptionCode
      });
    }
    if (this.hasChargeSettlement()) {
      settlements.push({
        type: 'Charge',
        account: this.chargeSettlementAccountNumber,
        customer: this.chargeSettlementCustomerName,
        option: this.chargeSettlementOptionCode
      });
    }
    return settlements;
  }

  get formattedCreateDate() { return this.createDate.toLocaleDateString(); }
  get isCompleteSetup() { return this.hasCreditSettlement() && this.hasDebitSettlement(); }
}

DepositAccountInterestOption.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  depositAcctId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account identifier'
  },
  drSettlementAcctId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Debit settlement account identifier'
  },
  crSettlementAcctId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Credit settlement account identifier'
  },
  crSettlementOptionCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Credit settlement option code'
  },
  drSettlementOptionCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Debit settlement option code'
  },
  crSettlementAccountNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Credit settlement account number'
  },
  drSettlementAccountNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Debit settlement account number'
  },
  crSettlementCustomerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Credit settlement customer name'
  },
  drSettlementCustomerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Debit settlement customer name'
  },
  crSettlementBicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Credit settlement BIC identifier'
  },
  drSettlementBicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Debit settlement BIC identifier'
  },
  createdBy: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
  },
  createDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Create date'
  },
  recStatus: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: { isIn: [['A', 'I']] },
    comment: 'Record status (A=Active, I=Inactive)'
  },
  rowTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row timestamp'
  },
  userId: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User identifier'
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number'
  },
  systemCreateTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp'
  },
  chargeSettlementAcctId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Charge settlement account identifier'
  },
  chargeSettlementOptionCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Charge settlement option code'
  },
  chargeSettlementAccountNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Charge settlement account number'
  },
  chargeSettlementCustomerName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Charge settlement customer name'
  },
  chargeSettlementBicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Charge settlement BIC identifier'
  }
}, {
  sequelize,
  modelName: 'DepositAccountInterestOption',
  tableName: 'deposit_account_interest_option',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
 
  hooks: {
    beforeValidate: (option) => {
      if (option.recStatus) option.recStatus = option.recStatus.toUpperCase();
      if (option.crSettlementCustomerName) option.crSettlementCustomerName = option.crSettlementCustomerName.trim();
      if (option.drSettlementCustomerName) option.drSettlementCustomerName = option.drSettlementCustomerName.trim();
      if (option.chargeSettlementCustomerName) option.chargeSettlementCustomerName = option.chargeSettlementCustomerName.trim();
      if (option.crSettlementAccountNumber) option.crSettlementAccountNumber = option.crSettlementAccountNumber.trim();
      if (option.drSettlementAccountNumber) option.drSettlementAccountNumber = option.drSettlementAccountNumber.trim();
      if (option.chargeSettlementAccountNumber) option.chargeSettlementAccountNumber = option.chargeSettlementAccountNumber.trim();
    },
    beforeCreate: async (option) => {
      const now = new Date();
      if (!option.createDate) option.createDate = now;
      if (!option.systemCreateTimestamp) option.systemCreateTimestamp = now;
      if (!option.rowTimestamp) option.rowTimestamp = now;
      const validation = await DepositAccountInterestOption.validateSettlementOptions(option.depositAcctId, option);
      if (!validation.isValid) throw new Error(validation.errors.join(', '));
    },
    beforeUpdate: (option) => {
      option.rowTimestamp = new Date();
      if (option.changed() && !option.changed('versionNo')) {
        option.versionNo = (option.versionNo || 0) + 1;
      }
    }
  },
  
  scopes: {
    active: { where: { recStatus: 'A' } },
    inactive: { where: { recStatus: 'I' } },
    byDepositAccount: (depositAcctId) => ({ where: { depositAcctId } }),
    byCreatedBy: (createdBy) => ({ where: { createdBy } }),
    withCreditSettlement: { where: { crSettlementOptionCode: { [Op.ne]: null } } },
    withDebitSettlement: { where: { drSettlementOptionCode: { [Op.ne]: null } } },
    withChargeSettlement: { where: { chargeSettlementOptionCode: { [Op.ne]: null } } },
    completeSetup: { where: { crSettlementOptionCode: { [Op.ne]: null }, drSettlementOptionCode: { [Op.ne]: null } } },
    recent: { order: [['createDate', 'DESC']], limit: 50 },
    dateRange: (startDate, endDate) => ({ where: { createDate: { [Op.between]: [startDate, endDate] } } })
  }
});

export default DepositAccountInterestOption;