// models/RepaymentSchedules.js
import { Model, DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class RepaymentSchedule extends Model {}

RepaymentSchedule.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  
  // Use snake_case for model fields that map to snake_case DB columns
  loan_account_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'loan_account_id' // Maps to DB column: loan_account_id
  },
  
  account_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'account_number' // Maps to DB column: account_number
  },
  
  customer_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'customer_id' // Maps to DB column: customer_id
  },
  
  start_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_date'
  },
  
  maturity_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'maturity_date'
  },
  
  principal_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'principal_amount'
  },
  
  interest_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    defaultValue: 0.0000,
    field: 'interest_rate'
  },
  
  interest_rate_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'FIXED',
    field: 'interest_rate_type'
  },
  
  interest_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'SIMPLE',
    field: 'interest_type'
  },
  
  calculation_method: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'FLAT_RATE',
    field: 'calculation_method'
  },
  
  is_term_based_rate: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'is_term_based_rate'
  },
  
  term: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'term'
  },
  
  term_type: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: 'M',
    field: 'term_type'
  },
  
  payment_frequency: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'MONTHLY',
    field: 'payment_frequency'
  },
  
  emi_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'emi_amount'
  },
  
  total_interest: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'total_interest'
  },
  
  total_repayment: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'total_repayment'
  },
  
  upfront_interest: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'upfront_interest'
  },
  
  guarantor_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'guarantor_id'
  },
  
  guaranteed_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'guaranteed_amount'
  },
  
  transaction_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'transaction_id'
  },
  
  event_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'event_id'
  },
  
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'created_by'
  },
  
  status: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'PENDING',
    field: 'status'
  },
  
  is_schedule_complete: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    field: 'is_schedule_complete'
  },
  
  // JSON field for installments
  installments_json: {
    type: DataTypes.TEXT, // Use TEXT for MySQL compatibility
    allowNull: true,
    field: 'installments_json',
    get() {
      const value = this.getDataValue('installments_json');
      if (!value) return [];
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (e) {
        console.error('Error parsing installments_json:', e);
        return [];
      }
    },
    set(value) {
      this.setDataValue(
        'installments_json',
        value && typeof value === 'object' ? JSON.stringify(value) : value
      );
    }
  },
  
  // Add schedule field as well (for backward compatibility)
  schedule: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'schedule',
    get() {
      const value = this.getDataValue('schedule');
      if (!value) return [];
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (e) {
        console.error('Error parsing schedule:', e);
        return [];
      }
    },
    set(value) {
      this.setDataValue(
        'schedule',
        value && typeof value === 'object' ? JSON.stringify(value) : value
      );
    }
  },
  
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'RepaymentSchedule',
  tableName: 'repayment_schedules',
  timestamps: false, // We're manually handling created_at/updated_at
  underscored: false, // Important: keep as false when using field mappings
  freezeTableName: true,
  indexes: [
    { 
      unique: true, 
      fields: ['account_number'] 
    },
    { 
      fields: ['loan_account_id'] 
    },
    { 
      fields: ['customer_id'] 
    },
    { 
      fields: ['status'] 
    },
    { 
      fields: ['is_schedule_complete'] 
    }
  ]
});

// Simple static method for creating schedule
RepaymentSchedule.createSchedule = async function(loanData, installments) {
  try {
    console.log('Creating repayment schedule for:', loanData.account_number || loanData.ACCT_NO);
    
    const scheduleData = {
      loan_account_id: loanData.id || loanData.loan_account_id,
      account_number: loanData.account_number || loanData.ACCT_NO,
      customer_id: loanData.customer_id || loanData.CUST_ID,
      start_date: loanData.start_date || loanData.START_DATE,
      maturity_date: loanData.maturity_date || loanData.MATURITY_DATE,
      principal_amount: loanData.principal_amount || loanData.DISBURSEMENT_LIMIT || 0,
      interest_rate: loanData.interest_rate || 0,
      term: loanData.term || 0,
      term_type: loanData.term_type || 'M',
      payment_frequency: loanData.payment_frequency || 'MONTHLY',
      status: 'PENDING',
      installments_json: installments,
      schedule: installments,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    console.log('Schedule data:', scheduleData);
    
    const schedule = await RepaymentSchedule.create(scheduleData);
    console.log('Repayment schedule created:', schedule.id);
    
    return schedule;
  } catch (error) {
    console.error('Error creating repayment schedule:', error);
    throw error;
  }
};

export default RepaymentSchedule;