// src/models/RepaymentSchedules.js – FINAL VERSION (with auto-create table)
import { Model, DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class RepaymentSchedule extends Model {
  /**
   * Ensure the repayment_schedules table exists. Call once during server startup.
   */
  static async ensureTableExists() {
    try {
      const [result] = await sequelize.query(
        `SELECT COUNT(*) as tableExists FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'repayment_schedules'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      if (result.tableExists === 0) {
        console.log('?? Creating repayment_schedules table...');
        await this.sync({ force: false });
        console.log('? repayment_schedules table created');
      } else {
        console.log('? repayment_schedules table already exists');
      }
      return true;
    } catch (error) {
      console.error('? Error ensuring repayment_schedules table:', error.message);
      return false;
    }
  }

  /**
   * Create a repayment schedule with installments.
   * @param {Object} loanData - Loan details (loan_account_id, account_number, customer_id, etc.)
   * @param {Array} installments - List of installment objects
   * @returns {Promise<RepaymentSchedule>}
   */
  static async createSchedule(loanData, installments) {
    try {
      console.log('Creating repayment schedule for:', loanData.account_number || loanData.ACCT_NO);

      const startDate = loanData.start_date || loanData.DISBURSEMENT_DATE || new Date();
      const term = loanData.term || loanData.TERM_VALUE || 12;
      const maturityDate = new Date(startDate);
      maturityDate.setMonth(maturityDate.getMonth() + term);

      const principalAmount = parseFloat(loanData.principal_amount || loanData.AMOUNT || loanData.DISBURSEMENT_LIMIT || 0);
      const interestRate = parseFloat(loanData.interest_rate || loanData.INTEREST_RATE || 0);
      const totalInterest = installments.reduce((sum, inst) => sum + (inst.interest || 0), 0);
      const totalRepayment = installments.reduce((sum, inst) => sum + (inst.totalPayment || 0), 0);
      const emiAmount = installments.length > 0 ? installments[0].totalPayment : 0;

      const scheduleData = {
        loan_account_id: loanData.id || loanData.loan_account_id,
        account_number: loanData.account_number || loanData.ACCT_NO,
        customer_id: loanData.customer_id || loanData.CUST_ID,
        start_date: startDate,
        maturity_date: maturityDate,
        principal_amount: principalAmount,
        interest_rate: interestRate,
        term: term,
        term_type: loanData.term_type || 'M',
        payment_frequency: loanData.payment_frequency || 'MONTHLY',
        emi_amount: emiAmount,
        total_interest: totalInterest,
        total_repayment: totalRepayment,
        upfront_interest: loanData.upfront_interest || 0,
        status: loanData.status || 'PENDING',
        is_schedule_complete: false,
        installments_json: installments,
        schedule: installments,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: loanData.created_by || loanData.CREATED_BY || 'SYSTEM',
        guarantor_id: loanData.guarantor_id || null,
        guaranteed_amount: loanData.guaranteed_amount || 0,
        transaction_id: loanData.transaction_id || null,
        event_id: loanData.event_id || null
      };

      const schedule = await RepaymentSchedule.create(scheduleData);
      console.log('? Repayment schedule created with ID:', schedule.id);
      return schedule;
    } catch (error) {
      console.error('? Error creating repayment schedule:', error);
      throw error;
    }
  }

  /**
   * Get the current (next pending or overdue) installment.
   * @returns {Object|null}
   */
  getCurrentInstallment() {
    if (!this.installments_json || !this.installments_json.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.installments_json.find(inst => {
      const dueDate = new Date(inst.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return inst.status === 'PENDING' || (inst.status === 'PENDING' && dueDate <= today);
    });
  }

  /**
   * Mark an installment as paid.
   * @param {number} installmentNo - Installment number (1-based)
   * @param {string} transactionReference - Reference of the payment transaction
   * @param {Object} transaction - Sequelize transaction (optional)
   * @returns {Promise<boolean>}
   */
  async markInstallmentPaid(installmentNo, transactionReference, transaction = null) {
    if (!this.installments_json) return false;
    const installments = [...this.installments_json];
    const installmentIndex = installments.findIndex(inst => inst.installmentNo === installmentNo);
    if (installmentIndex === -1) return false;

    installments[installmentIndex].status = 'PAID';
    installments[installmentIndex].paidDate = new Date();
    installments[installmentIndex].transactionReference = transactionReference;

    const allPaid = installments.every(inst => inst.status === 'PAID');
    const updateData = {
      installments_json: installments,
      schedule: installments,
      status: allPaid ? 'COMPLETED' : 'PENDING',
      is_schedule_complete: allPaid,
      updated_at: new Date()
    };
    await this.update(updateData, { transaction });
    return true;
  }
}

RepaymentSchedule.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    loan_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'loan_account_id'
    },
    account_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'account_number'
    },
    customer_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'customer_id'
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
    installments_json: {
      type: DataTypes.TEXT,
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
  },
  {
    sequelize,
    modelName: 'RepaymentSchedule',
    tableName: 'repayment_schedules',
    timestamps: false,
    underscored: false,
    freezeTableName: true,
    indexes: [
      { fields: ['loan_account_id'] },
      { fields: ['account_number'] },
      { fields: ['customer_id'] },
      { fields: ['maturity_date'] },
      { fields: ['status'] },
      { fields: ['created_by'] },
      { fields: ['is_schedule_complete'] }
    ]
  }
);

export default RepaymentSchedule;
