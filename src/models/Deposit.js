import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Standalone function for generating deposit account details (export this)
export const generateDepositAccountDetails = async () => {
  try {
    const ACCT_ID = `00000${Math.floor(Math.random() * 1000)}`.padStart(8, '0');
    const ACCT_NO = generateDepositAccountNumber();
    return {
      ACCT_ID,
      ACCT_NO,
    };
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
  // Static method: Generate deposit account details (calls the standalone function)
  static async generateDepositAccountDetails() {
    return generateDepositAccountDetails();
  }

  // Static method: Generate deposit account number (calls the standalone function)
  static generateDepositAccountNumber() {
    return generateDepositAccountNumber();
  }

  // Static method: Find by account number
  static async findByAccountNo(accountNo) {
    return this.findOne({
      where: { ACCT_NO: accountNo }
    });
  }

  // Static method: Find by customer ID
  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { CUST_ID: customerId },
      order: [['OPENED_DT', 'DESC']]
    });
  }

  // Static method: Get deposits by business unit
  static async findByBusinessUnit(buId) {
    return this.findAll({
      where: { BU_ID: buId },
      order: [['OPENED_DT', 'DESC']]
    });
  }

  // Static method: Get deposits by product
  static async findByProduct(productId) {
    return this.findAll({
      where: { PROD_ID: productId },
      order: [['OPENED_DT', 'DESC']]
    });
  }

  // Instance method: Get deposit summary
  getDepositSummary() {
    return {
      customerId: this.CUST_ID,
      accountId: this.ACCT_ID,
      accountNumber: this.ACCT_NO,
      accountName: this.ACCT_NM,
      businessUnit: this.BU_ID,
      relationshipManager: this.RSM_ID,
      productId: this.PROD_ID,
      openedDate: this.OPENED_DT,
      availableDate: this.AVAIL_DT,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Instance method: Check if deposit is active
  isActive() {
    return this.REC_ST === 'ACTIVE';
  }

  // Virtual getter: Days since opening
  get daysSinceOpening() {
    if (!this.OPENED_DT) return null;
    const today = new Date();
    const openedDate = new Date(this.OPENED_DT);
    const diffTime = Math.abs(today - openedDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

Deposit.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  CUST_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Customer identifier'
  },
  
  ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Account identifier'
  },
  
  ACCT_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Account name'
  },
  
  ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Account number'
  },
  
  BU_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Business unit identifier'
  },
  
  RSM_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Relationship manager identifier'
  },
  
  OPENED_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Account opened date'
  },
  
  AVAIL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Account available date'
  },
  
  PROD_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Product identifier'
  },
  
  REC_ST: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: {
      isIn: [['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED']]
    },
    comment: 'Record status'
  },
  
  CLOSED_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Account closed date'
  },
  
  CLOSED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Closed by user'
  },
  
  CLOSURE_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Closure reason'
  },
  
  SUSPENDED_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Account suspended date'
  },
  
  SUSPENDED_BY: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Suspended by user'
  },
  
  SUSPENSION_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Suspension reason'
  },
  
  CREATED_BY: {
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
}, {
  sequelize,
  modelName: 'Deposit',
  tableName: 'deposits',
  timestamps: true,
  hooks: {
    beforeValidate: async (deposit) => {
      // Validate that customer exists in either CustomerAccount or DepositAccountApplication
      if (deposit.CUST_ID) {
        const CustomerAccount = sequelize.models.CustomerAccount;
        const DepositAccountApplication = sequelize.models.DepositAccountApplication;
        
        const customerAccount = await CustomerAccount.findOne({ where: { CUST_ID: deposit.CUST_ID } });
        const application = await DepositAccountApplication.findOne({ where: { CUST_ID: deposit.CUST_ID } });
        
        if (!customerAccount && !application) {
          throw new Error('Customer ID does not exist in either CustomerAccount or DepositAccountApplication');
        }
      }
    },
    
    beforeCreate: async (deposit) => {
      try {
        const CustomerAccount = sequelize.models.CustomerAccount;
        const customerAccount = await CustomerAccount.findOne({ 
          where: { CUST_ID: deposit.CUST_ID } 
        });
        
        if (customerAccount) {
          deposit.ACCT_NO = customerAccount.ACCT_NO;
          deposit.ACCT_ID = customerAccount.ACCT_ID;
          deposit.ACCT_NM = customerAccount.ACCT_NM;
          deposit.BU_ID = customerAccount.BU_ID || deposit.BU_ID;
        } else {
          // Check for application
          const DepositAccountApplication = sequelize.models.DepositAccountApplication;
          const application = await DepositAccountApplication.findOne({ 
            where: { CUST_ID: deposit.CUST_ID } 
          });
          
          if (application) {
            // Create customer account from application
            const newCustomerAccount = await CustomerAccount.create({
              CUST_ID: application.CUST_ID,
              ACCT_ID: application.ACCT_ID,
              ACCT_NO: application.ACCT_NO,
              ACCT_NM: application.ACCT_NM || deposit.ACCT_NM,
              BU_ID: application.BU_ID || deposit.BU_ID,
              LEDGER_BAL: 0.0,
              CLEARED_BAL: 0.0,
              AVAILABLE_BALANCE: 0.0,
              ACCOUNT_TYPE: 'SAVINGS',
              PRODUCT_DESC: 'Regular savings account',
              REC_ST: 'ACTIVE',
              CREATED_BY: deposit.CREATED_BY
            });
            
            deposit.ACCT_NO = newCustomerAccount.ACCT_NO;
            deposit.ACCT_ID = newCustomerAccount.ACCT_ID;
            deposit.ACCT_NM = newCustomerAccount.ACCT_NM;
            deposit.BU_ID = newCustomerAccount.BU_ID;
          } else {
            // Generate new account details using the exported function
            const { ACCT_ID, ACCT_NO } = await generateDepositAccountDetails();
            deposit.ACCT_NO = ACCT_NO;
            deposit.ACCT_ID = ACCT_ID;
          }
        }
        
        // Set opened date if not provided
        if (!deposit.OPENED_DT) {
          deposit.OPENED_DT = new Date();
        }
        
        // Set available date (default to opened date + 1 day)
        if (!deposit.AVAIL_DT) {
          const availDate = new Date(deposit.OPENED_DT);
          availDate.setDate(availDate.getDate() + 1);
          deposit.AVAIL_DT = availDate;
        }
        
      } catch (error) {
        console.error('Error generating account details:', error.message);
        throw error;
      }
    },
    
    afterCreate: async (deposit) => {
      try {
        // Update application status if it exists
        const DepositAccountApplication = sequelize.models.DepositAccountApplication;
        await DepositAccountApplication.update(
          { STATUS: 'ACTIVE' },
          { where: { CUST_ID: deposit.CUST_ID } }
        );
        
        // Create audit trail
        const AuditTrail = sequelize.models.AuditTrail;
        await AuditTrail.create({
          tableName: 'deposits',
          recordId: deposit.id,
          action: 'CREATE',
          userId: deposit.CREATED_BY || 'system',
          oldValues: null,
          newValues: JSON.stringify(deposit.getDepositSummary()),
          ipAddress: '127.0.0.1',
          userAgent: 'Sequelize'
        });
        
      } catch (error) {
        console.error('Error in post-create operations:', error);
        // Don't throw error here to avoid rollback of deposit creation
      }
    },
    
    afterUpdate: async (deposit) => {
      try {
        // Create audit trail for update
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
        // Create audit trail for delete
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
  indexes: [
    // Primary search indexes
    { fields: ['ACCT_NO'], unique: true },
    { fields: ['CUST_ID'] },
    { fields: ['ACCT_ID'] },
    { fields: ['BU_ID'] },
    { fields: ['RSM_ID'] },
    { fields: ['PROD_ID'] },
    { fields: ['REC_ST'] },
    
    // Composite indexes
    { fields: ['CUST_ID', 'REC_ST'] },
    { fields: ['BU_ID', 'REC_ST'] },
    { fields: ['PROD_ID', 'REC_ST'] },
    { fields: ['RSM_ID', 'REC_ST'] },
    { fields: ['OPENED_DT', 'REC_ST'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'ACTIVE' }
    },
    inactive: {
      where: { REC_ST: 'INACTIVE' }
    },
    suspended: {
      where: { REC_ST: 'SUSPENDED' }
    },
    closed: {
      where: { REC_ST: 'CLOSED' }
    },
    byCustomer: (customerId) => ({
      where: { CUST_ID: customerId }
    }),
    byBusinessUnit: (buId) => ({
      where: { BU_ID: buId }
    }),
    byProduct: (productId) => ({
      where: { PROD_ID: productId }
    }),
    byRelationshipManager: (rsmId) => ({
      where: { RSM_ID: rsmId }
    }),
    byDateRange: (startDate, endDate) => ({
      where: {
        OPENED_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    recent: {
      order: [['OPENED_DT', 'DESC']],
      limit: 100
    }
  }
});


export default Deposit;
