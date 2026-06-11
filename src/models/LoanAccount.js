// src/models/LoanAccount.js – Corrected (single accrued_interest column)
import { DataTypes, Op, QueryTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanAccount extends Model {
  static async findOverdueLoans(currentDate = new Date()) {
    await this.ensureTableExists();
    return await this.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        NEXT_PAYMENT_DATE: { [Op.lt]: currentDate },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 }
      }
    });
  }

  static async markLoansAsOverdue(currentDate = new Date()) {
    await this.ensureTableExists();
    const overdueLoans = await this.findOverdueLoans(currentDate);
    let modifiedCount = 0;
    for (const loan of overdueLoans) {
      try {
        await loan.update({ LOAN_STATUS: 'OVERDUE', updatedAt: new Date() });
        modifiedCount++;
      } catch (error) {
        console.error(`Failed to mark loan ${loan.ACCT_NO} as overdue:`, error.message);
      }
    }
    return { modifiedCount };
  }

  static async findByAccountNumber(accountNumber) {
    await this.ensureTableExists();
    return await this.findOne({ where: { ACCT_NO: accountNumber } });
  }

  static async findByCustomerId(customerId) {
    await this.ensureTableExists();
    return await this.findAll({ where: { CUST_ID: customerId } });
  }

  static async findByCreatedBy(userId) {
    await this.ensureTableExists();
    return await this.findAll({ 
      where: { CREATED_BY: userId },
      order: [['created_at', 'DESC']]
    });
  }

  static async ensureTableExists() {
    try {
      const [result] = await sequelize.query(
        `SELECT COUNT(*) as tableExists FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = 'loan_accounts'`,
        { type: QueryTypes.SELECT }
      );
      if (result.tableExists === 0) {
        console.log('📝 Creating loan_accounts table...');
        await this.sync({ force: false });
        console.log('✅ loan_accounts table created');
      }
      return true;
    } catch (error) {
      console.error('❌ Error ensuring loan_accounts table:', error.message);
      return false;
    }
  }

  getAccountNumber() { return this.ACCT_NO; }
  getCustomerId() { return this.CUST_ID; }
  getLoanStatus() { return this.LOAN_STATUS; }
  getOutstandingPrincipal() { return parseFloat(this.OUTSTANDING_PRINCIPAL) || 0; }
  isActive() { return ['ACTIVE', 'DISBURSED', 'APPROVED'].includes(this.LOAN_STATUS); }
}

LoanAccount.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Basic loan account info
    ACCT_NO: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'ACCT_NO'
    },
    ACCT_NM: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'ACCT_NM'
    },
    CUST_ID: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'CUST_ID'
    },
    LOAN_PRODUCT_ID: {
      type: DataTypes.INTEGER,
      field: 'LOAN_PRODUCT_ID'
    },

    // Amounts
    AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'AMOUNT'
    },
    DISBURSED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'DISBURSED_AMOUNT'
    },
    OUTSTANDING_PRINCIPAL: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'OUTSTANDING_PRINCIPAL'
    },
    // ✅ FIXED: Single column for accrued interest – maps to `accrued_interest`
    ACCRUED_INTEREST: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'accrued_interest'        // actual column name (lowercase)
    },
    PENALTY_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'PENALTY_AMOUNT'
    },

    // Interest and status
    INTEREST_RATE: {
      type: DataTypes.DECIMAL(10, 4),
      defaultValue: 0,
      field: 'INTEREST_RATE'
    },
    LOAN_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'PENDING',
      field: 'LOAN_STATUS'
    },
    SERVICING_STATUS: {
      type: DataTypes.STRING(50),
      defaultValue: 'SERVICED',
      field: 'SERVICING_STATUS'
    },

    // Dates
    APPLICATION_DATE: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'APPLICATION_DATE'
    },
    APPROVAL_DATE: {
      type: DataTypes.DATE,
      field: 'APPROVAL_DATE'
    },
    DISBURSEMENT_DATE: {
      type: DataTypes.DATE,
      field: 'DISBURSEMENT_DATE'
    },
    CLOSURE_DATE: {
      type: DataTypes.DATE,
      field: 'CLOSURE_DATE'
    },
    LAST_REPAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'LAST_REPAYMENT_DATE'
    },
    LAST_REPAYMENT_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'LAST_REPAYMENT_AMOUNT'
    },
    NEXT_PAYMENT_DATE: {
      type: DataTypes.DATE,
      field: 'NEXT_PAYMENT_DATE'
    },
    MATURITY_DT: {
      type: DataTypes.DATE,
      field: 'MATURITY_DT'
    },

    // Repayment tracking
    TOTAL_REPAID_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0,
      field: 'TOTAL_REPAID_AMOUNT'
    },
    TERM_CD: {
      type: DataTypes.STRING(20),
      defaultValue: 'MONTHLY',
      field: 'TERM_CD'
    },
    TERM_VALUE: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      field: 'TERM_VALUE'
    },
    CUSTOMER_ACCOUNT_ID: {
      type: DataTypes.BIGINT,
      field: 'CUSTOMER_ACCOUNT_ID'
    },

    // Guarantor info
    GUARANTOR_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'GUARANTOR_ID'
    },
    GUARANTEED_AMOUNT: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      field: 'GUARANTEED_AMOUNT'
    },

    // Portfolio
    LOAN_PORTFOLIO_ID: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'LOAN_PORTFOLIO_ID'
    },

    // Audit fields
    CREATED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'CREATED_BY'
    },

    // Schedule flags
    hasRepaymentSchedule: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'has_repayment_schedule'
    },
    repaymentScheduleId: {
      type: DataTypes.INTEGER,
      field: 'repayment_schedule_id'
    },

    // Timestamps
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'LoanAccount',
    tableName: 'loan_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false      // disable automatic underscore conversion
  }
);

export default LoanAccount;