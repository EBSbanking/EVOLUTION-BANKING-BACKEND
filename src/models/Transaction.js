// models/Transaction.js - COMPLETE FIXED VERSION
import { DataTypes, Op, QueryTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// ? Updated: Helper function to get all transaction types including VAT
const getAllTransactionTypes = () => [
  'DEPOSIT','WITHDRAWAL','TRANSFER','LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT','FEE_CHARGE','INTEREST_CREDIT','INTEREST_CHARGE',
  'PENALTY_CHARGE','SALARY_PAYMENT','BILL_PAYMENT','ATM_WITHDRAWAL',
  'ONLINE_TRANSFER','MOBILE_TRANSFER','STANDING_ORDER','DIRECT_DEBIT',
  'CHEQUE_DEPOSIT','CASH_DEPOSIT','CASH_WITHDRAWAL','REVERSAL','ADJUSTMENT',
  'REFUND','THRIFT_OPENING','THRIFT_COLLECTION','THRIFT_WITHDRAWAL','THRIFT_BANK_PAYMENT',
  'TAX_PAYMENT',
  'VAT_CHARGE'
];

class Transaction extends Model {
  // ... (all your static methods remain the same) ...
}

// Initialize the model
Transaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    account_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    account_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    drawer_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    drawer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bu_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    customer_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    account_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    transaction_direction: {
      type: DataTypes.ENUM('CREDIT', 'DEBIT'),
      allowNull: false,
      defaultValue: 'CREDIT',
    },
    transaction_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    transaction_type: {
      type: DataTypes.ENUM(...getAllTransactionTypes()),
      allowNull: false,
    },
    transaction_identifier: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    transaction_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    event_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    journal_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    currency: {
      type: DataTypes.ENUM('NGN', 'USD', 'GBP', 'EUR'),
      defaultValue: 'NGN',
    },
    created_by: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'REVERSED'),
      defaultValue: 'PENDING',
    },
    flagged_for_aml: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    aml_reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    aml_threshold_used: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
    },
    approval_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    approved_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    approval_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rejection_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejected_by: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    rejection_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // ? REMOVED: created_at and updated_at from here
  },
  {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: false, // ?? DISABLE automatic timestamps
    underscored: true,
    indexes: [
      { fields: ['account_number'] },
      { fields: ['account_id'] },
      { fields: ['drawer_no'] },
      { fields: ['drawer_id'] },
      { fields: ['transaction_date'] },
      { fields: ['transaction_type'] },
      { fields: ['customer_id'] },
      { fields: ['status'] },
      { fields: ['created_by'] },
      { fields: ['account_number', 'transaction_date'] },
      { fields: ['customer_id', 'status'] },
      { fields: ['transaction_date', 'status'] },
      { fields: ['account_number', 'transaction_type'] }
    ]
  }
);

// =============================================
// ----- HOOKS SECTION -----
// REPLACE THIS ENTIRE SECTION WITH THE NEW CODE
// =============================================

Transaction.beforeCreate(async (transaction, options) => {
  console.log('Before create hook - Setting timestamps and IDs:', { 
    transaction_identifier: transaction.transaction_identifier,
    event_id: transaction.event_id, 
    journal_id: transaction.journal_id,
    reference: transaction.reference,
    drawer_no: transaction.drawer_no,
    drawer_id: transaction.drawer_id
  });

  // ? Set timestamps manually
  const now = new Date();
  if (!transaction.created_at) {
    transaction.created_at = now;
  }
  if (!transaction.updated_at) {
    transaction.updated_at = now;
  }

  const hasProvidedIds = transaction.transaction_identifier && transaction.event_id && transaction.journal_id && transaction.reference;
  
  if (!hasProvidedIds) {
    console.log('Auto-generating transaction IDs...');
    
    try {
      // ? FIX: Get the maximum numeric ID properly
      const [result] = await sequelize.query(
        'SELECT MAX(CAST(transaction_identifier AS UNSIGNED)) as max_id FROM transactions',
        { type: QueryTypes.SELECT }
      );
      
      // ? FIX: Start from 1 if no records exist, otherwise increment by 1
      let nextTransactionId = 1;
      if (result && result.max_id !== null && result.max_id !== undefined) {
        nextTransactionId = Number(result.max_id) + 1;
      }
      
      console.log('Next transaction ID will be:', nextTransactionId);
      
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      
      // ? FIX: Use the numeric ID for transaction_identifier
      if (!transaction.transaction_identifier) {
        transaction.transaction_identifier = String(nextTransactionId);
      }
      if (!transaction.event_id) {
        transaction.event_id = String(nextTransactionId);
      }
      if (!transaction.journal_id) {
        transaction.journal_id = `JRN${timestamp}${randomSuffix}`;
      }
      if (!transaction.reference) {
        transaction.reference = `TXN${String(nextTransactionId).padStart(10, '0')}`;
      }
      if (!transaction.transaction_id) {
        transaction.transaction_id = `TXN${String(nextTransactionId).padStart(10, '0')}`;
      }
      
      console.log('Auto-generated IDs:', { 
        transaction_identifier: transaction.transaction_identifier,
        event_id: transaction.event_id,
        journal_id: transaction.journal_id,
        reference: transaction.reference
      });
    } catch (error) {
      console.error('Error generating transaction IDs:', error);
      const fallbackId = String(Math.floor(Math.random() * 1000000));
      
      if (!transaction.transaction_identifier) transaction.transaction_identifier = fallbackId;
      if (!transaction.event_id) transaction.event_id = fallbackId;
      if (!transaction.journal_id) transaction.journal_id = `JRN${Date.now()}`;
      if (!transaction.reference) transaction.reference = `TXN${fallbackId}`;
      if (!transaction.transaction_id) transaction.transaction_id = `TXN${fallbackId}`;
    }
  } else {
    console.log('Using provided IDs:', { 
      transaction_identifier: transaction.transaction_identifier,
      event_id: transaction.event_id,
      journal_id: transaction.journal_id,
      reference: transaction.reference
    });
  }
});

// ? Add afterCreate hook to log success
Transaction.afterCreate((transaction) => {
  console.log('? Transaction created successfully:', {
    id: transaction.id,
    reference: transaction.reference,
    amount: transaction.amount,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at
  });
});

export default Transaction;
