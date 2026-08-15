// src/models/Deposit.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Standalone function for generating deposit account details
export const generateDepositAccountDetails = async () => {
  try {
    const ACCT_ID = `00000${Math.floor(Math.random() * 1000)}`.padStart(8, '0');
    const ACCT_NO = generateDepositAccountNumber();
    return { ACCT_ID, ACCT_NO };
  } catch (error) {
    console.error('Error generating deposit account details:', error.message);
    throw new Error('Error generating deposit account details');
  }
};

// Helper function for generating account number
export const generateDepositAccountNumber = () => {
  const random = Math.floor(Math.random() * 100);
  return `10000000${random.toString().padStart(2, '0')}`;
};

class Deposit extends Model {
  // Static methods
  static async generateDepositAccountDetails() {
    return generateDepositAccountDetails();
  }

  static generateDepositAccountNumber() {
    return generateDepositAccountNumber();
  }

  static async findByAccountNo(accountNo) {
    return this.findOne({ where: { accountNo } });
  }

  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { customerId },
      order: [['openedDate', 'DESC']]
    });
  }

  static async findByBusinessUnit(buId) {
    return this.findAll({
      where: { businessUnitId: buId },
      order: [['openedDate', 'DESC']]
    });
  }

  static async findByProduct(productId) {
    return this.findAll({
      where: { productId },
      order: [['openedDate', 'DESC']]
    });
  }

  // Instance method: get deposit summary
  getDepositSummary() {
    return {
      customerId: this.customerId,
      accountId: this.accountId,
      accountNumber: this.accountNo,
      accountName: this.accountName,
      businessUnit: this.businessUnitId,
      relationshipManager: this.relationshipManagerId,
      productId: this.productId,
      openedDate: this.openedDate,
      availableDate: this.availableDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  isActive() {
    return this.recordStatus === 'ACTIVE';
  }

  get daysSinceOpening() {
    if (!this.openedDate) return null;
    const today = new Date();
    const openedDate = new Date(this.openedDate);
    const diffTime = Math.abs(today - openedDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

Deposit.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Customer identifier'
    },
    accountId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Account identifier'
    },
    accountName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Account name'
    },
    accountNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Account number'
    },
    businessUnitId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Business unit identifier'
    },
    relationshipManagerId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Relationship manager identifier'
    },
    openedDate: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Account opened date'
    },
    availableDate: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Account available date'
    },
    productId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Product identifier'
    },
    recordStatus: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'ACTIVE',
      validate: {
        isIn: [['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED']]
      },
      comment: 'Record status'
    },
    closedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Account closed date'
    },
    closedBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Closed by user'
    },
    closureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Closure reason'
    },
    suspendedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Account suspended date'
    },
    suspendedBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Suspended by user'
    },
    suspensionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Suspension reason'
    },
    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Created by user'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'Deposit',
    tableName: 'deposits',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    hooks: {
      beforeValidate: async (deposit) => {
        if (deposit.customerId) {
          const CustomerAccount = sequelize.models.CustomerAccount;
          const DepositAccountApplication = sequelize.models.DepositAccountApplication;
          const customerAccount = await CustomerAccount.findOne({ where: { CUST_ID: deposit.customerId } });
          const application = await DepositAccountApplication.findOne({ where: { CUST_ID: deposit.customerId } });
          if (!customerAccount && !application) {
            throw new Error('Customer ID does not exist in either CustomerAccount or DepositAccountApplication');
          }
        }
      },
      beforeCreate: async (deposit) => {
        try {
          const CustomerAccount = sequelize.models.CustomerAccount;
          const customerAccount = await CustomerAccount.findOne({
            where: { CUST_ID: deposit.customerId }
          });

          if (customerAccount) {
            deposit.accountNo = customerAccount.ACCT_NO;
            deposit.accountId = customerAccount.ACCT_ID;
            deposit.accountName = customerAccount.ACCT_NM;
            deposit.businessUnitId = customerAccount.BU_ID || deposit.businessUnitId;
          } else {
            const DepositAccountApplication = sequelize.models.DepositAccountApplication;
            const application = await DepositAccountApplication.findOne({
              where: { CUST_ID: deposit.customerId }
            });
            if (application) {
              const newCustomerAccount = await CustomerAccount.create({
                CUST_ID: application.CUST_ID,
                ACCT_ID: application.ACCT_ID,
                ACCT_NO: application.ACCT_NO,
                ACCT_NM: application.ACCT_NM || deposit.accountName,
                BU_ID: application.BU_ID || deposit.businessUnitId,
                LEDGER_BAL: 0.0,
                CLEARED_BAL: 0.0,
                AVAILABLE_BALANCE: 0.0,
                ACCOUNT_TYPE: 'SAVINGS',
                PRODUCT_DESC: 'Regular savings account',
                REC_ST: 'ACTIVE',
                CREATED_BY: deposit.createdBy
              });
              deposit.accountNo = newCustomerAccount.ACCT_NO;
              deposit.accountId = newCustomerAccount.ACCT_ID;
              deposit.accountName = newCustomerAccount.ACCT_NM;
              deposit.businessUnitId = newCustomerAccount.BU_ID;
            } else {
              const { ACCT_ID, ACCT_NO } = await generateDepositAccountDetails();
              deposit.accountNo = ACCT_NO;
              deposit.accountId = ACCT_ID;
            }
          }

          if (!deposit.openedDate) deposit.openedDate = new Date();
          if (!deposit.availableDate) {
            const availDate = new Date(deposit.openedDate);
            availDate.setDate(availDate.getDate() + 1);
            deposit.availableDate = availDate;
          }
        } catch (error) {
          console.error('Error generating account details:', error.message);
          throw error;
        }
      },
      afterCreate: async (deposit) => {
        try {
          const DepositAccountApplication = sequelize.models.DepositAccountApplication;
          await DepositAccountApplication.update(
            { STATUS: 'ACTIVE' },
            { where: { CUST_ID: deposit.customerId } }
          );
          const AuditTrail = sequelize.models.AuditTrail;
          await AuditTrail.create({
            tableName: 'deposits',
            recordId: deposit.id,
            action: 'CREATE',
            userId: deposit.createdBy || 'system',
            oldValues: null,
            newValues: JSON.stringify(deposit.getDepositSummary()),
            ipAddress: '127.0.0.1',
            userAgent: 'Sequelize'
          });
        } catch (error) {
          console.error('Error in post-create operations:', error);
        }
      },
      afterUpdate: async (deposit) => {
        try {
          const AuditTrail = sequelize.models.AuditTrail;
          await AuditTrail.create({
            tableName: 'deposits',
            recordId: deposit.id,
            action: 'UPDATE',
            userId: deposit.updatedBy || 'system',
            oldValues: JSON.stringify(deposit._previousDataValues),
            newValues: JSON.stringify(deposit.dataValues),
            ipAddress: '127.0.0.1',
            userAgent: 'Sequelize'
          });
        } catch (error) {
          console.error('Error creating audit trail:', error);
        }
      },
      afterDestroy: async (deposit) => {
        try {
          const AuditTrail = sequelize.models.AuditTrail;
          await AuditTrail.create({
            tableName: 'deposits',
            recordId: deposit.id,
            action: 'DELETE',
            userId: deposit.deletedBy || 'system',
            oldValues: JSON.stringify(deposit._previousDataValues),
            newValues: null,
            ipAddress: '127.0.0.1',
            userAgent: 'Sequelize'
          });
        } catch (error) {
          console.error('Error creating audit trail:', error);
        }
      }
    },
    scopes: {
      active: { where: { recordStatus: 'ACTIVE' } },
      inactive: { where: { recordStatus: 'INACTIVE' } },
      suspended: { where: { recordStatus: 'SUSPENDED' } },
      closed: { where: { recordStatus: 'CLOSED' } },
      byCustomer: (customerId) => ({ where: { customerId } }),
      byBusinessUnit: (buId) => ({ where: { businessUnitId: buId } }),
      byProduct: (productId) => ({ where: { productId } }),
      byRelationshipManager: (rsmId) => ({ where: { relationshipManagerId: rsmId } }),
      byDateRange: (startDate, endDate) => ({
        where: {
          openedDate: {
            [Op.between]: [startDate, endDate]
          }
        }
      }),
      recent: {
        order: [['openedDate', 'DESC']],
        limit: 100
      }
    }
  }
);

export default Deposit;
