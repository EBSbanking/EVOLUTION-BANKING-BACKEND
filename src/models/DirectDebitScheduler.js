// models/DirectDebitScheduler.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DirectDebitScheduler extends Model {
  // Static methods
  static findByDirectDebitId(directDebitId) {
    return DirectDebitScheduler.findAll({
      where: { DIRECT_DR_ID: directDebitId },
      order: [['PAY_DT', 'ASC']]
    });
  }

  static findUpcomingPayments(date = new Date()) {
    return DirectDebitScheduler.findAll({
      where: {
        PAY_DT: { [Op.gte]: date },
        REC_ST: 'Y',
        SKIP_PAY_FG: 'N'
      },
      order: [['PAY_DT', 'ASC']]
    });
  }

  static findSkippedPayments() {
    return DirectDebitScheduler.findAll({
      where: {
        SKIP_PAY_FG: 'Y',
        REC_ST: 'Y'
      },
      order: [['PAY_DT', 'DESC']]
    });
  }

  static findActiveSchedules() {
    return DirectDebitScheduler.findAll({
      where: { REC_ST: 'Y' },
      order: [['PAY_DT', 'ASC']]
    });
  }

  static findByPaymentDateRange(startDate, endDate) {
    return DirectDebitScheduler.findAll({
      where: {
        PAY_DT: { [Op.between]: [startDate, endDate] },
        REC_ST: 'Y'
      },
      order: [['PAY_DT', 'ASC']]
    });
  }

  // Instance methods
  async skipPayment() {
    return this.update({ 
      SKIP_PAY_FG: 'Y',
      ROW_TS: new Date()
    });
  }

  async unskipPayment() {
    return this.update({ 
      SKIP_PAY_FG: 'N',
      ROW_TS: new Date()
    });
  }

  async deactivate() {
    return this.update({ 
      REC_ST: 'N',
      ROW_TS: new Date()
    });
  }

  async activate() {
    return this.update({ 
      REC_ST: 'Y',
      ROW_TS: new Date()
    });
  }

  async updatePaymentAmount(newAmount) {
    return this.update({ 
      PAY_AMT: newAmount,
      ROW_TS: new Date()
    });
  }

  async updatePaymentDate(newDate) {
    return this.update({ 
      PAY_DT: newDate,
      ROW_TS: new Date()
    });
  }

  isSkipped() {
    return this.SKIP_PAY_FG === 'Y';
  }

  isActive() {
    return this.REC_ST === 'Y';
  }

  isUpcoming() {
    return this.PAY_DT > new Date() && this.isActive() && !this.isSkipped();
  }

  isPastDue() {
    return this.PAY_DT < new Date() && this.isActive() && !this.isSkipped();
  }

  getScheduleDetails() {
    return {
      SCHED_ID: this.SCHED_ID,
      DIRECT_DR_ID: this.DIRECT_DR_ID,
      PAY_DT: this.PAY_DT,
      PAY_AMT: parseFloat(this.PAY_AMT),
      SKIP_PAY_FG: this.SKIP_PAY_FG,
      REC_ST: this.REC_ST,
      VERSION_NO: this.VERSION_NO,
      USER_ID: this.USER_ID,
      CREATE_DT: this.CREATE_DT,
      CREATED_BY: this.CREATED_BY
    };
  }

  // Getters
  get paymentAmountNumeric() {
    return parseFloat(this.PAY_AMT) || 0;
  }

  get daysUntilPayment() {
    const today = new Date();
    const paymentDate = new Date(this.PAY_DT);
    const diffTime = paymentDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get paymentStatus() {
    if (!this.isActive()) return 'inactive';
    if (this.isSkipped()) return 'skipped';
    if (this.PAY_DT > new Date()) return 'upcoming';
    if (this.PAY_DT < new Date()) return 'past_due';
    return 'due_today';
  }
}

DirectDebitScheduler.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  SCHED_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: {
      notNull: true,
      isInt: true
    }
  },
  DIRECT_DR_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  PAY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: true,
      isDate: true
    }
  },
  PAY_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0.01
    }
  },
  SKIP_PAY_FG: {
    type: DataTypes.STRING(1),
    defaultValue: 'N',
    validate: {
      isIn: [['Y', 'N']]
    }
  },
  REC_ST: {
    type: DataTypes.STRING(1),
    defaultValue: 'Y',
    validate: {
      isIn: [['Y', 'N']]
    }
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      isInt: true,
      min: 1
    }
  },
  ROW_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 24]
    }
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: true,
      isDate: true
    }
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 24]
    }
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DirectDebitScheduler',
  tableName: 'DirectDebitSchedulers',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeCreate: (scheduler, options) => {
      // Ensure SCHED_ID is provided
      if (!scheduler.SCHED_ID) {
        // Generate a SCHED_ID if not provided (timestamp-based)
        scheduler.SCHED_ID = Math.floor(Date.now() / 1000);
      }
      
      // Set default dates if not provided
      if (!scheduler.CREATE_DT) {
        scheduler.CREATE_DT = new Date();
      }
      
      if (!scheduler.ROW_TS) {
        scheduler.ROW_TS = new Date();
      }
      
      if (!scheduler.SYS_CREATE_TS) {
        scheduler.SYS_CREATE_TS = new Date();
      }
    },
    
    beforeUpdate: (scheduler, options) => {
      // Update ROW_TS on every update
      scheduler.ROW_TS = new Date();
      
      // Increment version number on update
      if (scheduler.changed() && !scheduler.changed('VERSION_NO')) {
        scheduler.VERSION_NO = (scheduler.VERSION_NO || 1) + 1;
      }
    }
  },
  indexes: [
    {
      name: 'idx_direct_debit_scheduler_sched_id',
      fields: ['SCHED_ID'],
      unique: true
    },
    {
      name: 'idx_direct_debit_scheduler_direct_dr_id',
      fields: ['DIRECT_DR_ID']
    },
    {
      name: 'idx_direct_debit_scheduler_pay_dt',
      fields: ['PAY_DT']
    },
    {
      name: 'idx_direct_debit_scheduler_rec_st',
      fields: ['REC_ST']
    },
    {
      name: 'idx_direct_debit_scheduler_skip_pay_fg',
      fields: ['SKIP_PAY_FG']
    },
    {
      name: 'idx_direct_debit_scheduler_user_id',
      fields: ['USER_ID']
    },
    {
      name: 'idx_direct_debit_scheduler_create_dt',
      fields: ['CREATE_DT']
    },
    // Composite indexes for common queries
    {
      name: 'idx_direct_debit_scheduler_active_upcoming',
      fields: ['REC_ST', 'SKIP_PAY_FG', 'PAY_DT'],
      where: {
        REC_ST: 'Y',
        SKIP_PAY_FG: 'N'
      }
    },
    {
      name: 'idx_direct_debit_scheduler_direct_dr_status',
      fields: ['DIRECT_DR_ID', 'REC_ST', 'SKIP_PAY_FG']
    },
    {
      name: 'idx_direct_debit_scheduler_pay_dt_range',
      fields: ['PAY_DT', 'REC_ST']
    }
  ]
});

export default DirectDebitScheduler;
