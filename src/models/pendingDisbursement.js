import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class PendingDisbursement extends Model {}

PendingDisbursement.init({
  workItemId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  loanAccountId: {
    type: DataTypes.INTEGER, // Or DataTypes.BIGINT if using numeric IDs
    allowNull: false,
    // If using string/ObjectId format, use DataTypes.STRING instead
    references: {
      model: 'LoanAccounts', // Assuming 'LoanAccount' table is named 'LoanAccounts'
      key: 'id'
    }
  },
  transactionData: {
    type: DataTypes.JSON, // Use JSON for PostgreSQL, TEXT for MySQL, or JSONB for PostgreSQL
    allowNull: false,
  },
  status: { 
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), 
    allowNull: false,
    defaultValue: 'PENDING',
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdAt: { 
    type: DataTypes.DATE, 
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  approvedBy: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  loanAccountNo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2), // Adjust precision and scale as needed
    allowNull: false,
  }
}, {
  sequelize,
  modelName: 'PendingDisbursement',
  tableName: 'PendingDisbursements',
  timestamps: false,
  indexes: [
    // Single column indexes
    {
      name: 'pending_disbursements_workitemid_idx',
      fields: ['workItemId']
    },
    {
      name: 'pending_disbursements_status_idx',
      fields: ['status']
    },
    {
      name: 'pending_disbursements_createdat_idx',
      fields: ['createdAt']
    },
    // Composite index
    {
      name: 'pending_disbursements_loanaccountid_status_idx',
      fields: ['loanAccountId', 'status']
    }
  ],
  // If you need to disable versioning (like versionKey: false in Mongoose)
  // Sequelize doesn't have built-in versioning by default
});

export default PendingDisbursement;
