// models/SMS.js - UPDATED with correct table name and fields
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

class SMS extends Model {
  // Static method to find by recipient phone number
  static async findByPhoneNumber(phoneNumber, options = {}) {
    const defaultOptions = {
      where: { RECIPIENT_PHONE_NUMBER: phoneNumber },
      order: [['TXN_DATE', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find by account number
  static async findByAccountNumber(accountNo, options = {}) {
    const defaultOptions = {
      where: { ACCT_NO: accountNo },
      order: [['TXN_DATE', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find by external SMS ID
  static async findByExternalId(externalSmsId, options = {}) {
    return await this.findOne({
      where: { EXTERNAL_SMS_ID: externalSmsId },
      ...options
    });
  }

  // Static method to find SMS by date range
  static async findByDateRange(startDate, endDate, options = {}) {
    const defaultOptions = {
      where: {
        TXN_DATE: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['TXN_DATE', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find SMS by transaction type (debit/credit)
  static async findByTransactionType(drCrIndicator, options = {}) {
    const defaultOptions = {
      where: { DR_CR_IND: drCrIndicator },
      order: [['TXN_DATE', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to get SMS statistics
  static async getStatistics(startDate, endDate) {
    const result = await this.findAll({
      attributes: [
        'DR_CR_IND',
        [sequelize.fn('COUNT', sequelize.col('id')), 'smsCount'],
        [sequelize.fn('SUM', sequelize.col('TXN_AMT')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('TXN_AMT')), 'averageAmount']
      ],
      where: {
        TXN_DATE: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: ['DR_CR_IND'],
      raw: true
    });
    
    return result.reduce((stats, row) => {
      stats[row.DR_CR_IND] = {
        smsCount: parseInt(row.smsCount),
        totalAmount: parseFloat(row.totalAmount) || 0,
        averageAmount: parseFloat(row.averageAmount) || 0
      };
      return stats;
    }, {});
  }

  // Static method to create SMS record
  static async createSMS(data) {
    try {
      // Generate EXTERNAL_SMS_ID if not provided
      if (!data.EXTERNAL_SMS_ID) {
        data.EXTERNAL_SMS_ID = `SMS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      }
      
      // Set default values
      if (!data.REC_ST) data.REC_ST = 'A';
      if (!data.ROW_TS) data.ROW_TS = new Date();
      if (!data.SYS_CREATE_TS) data.SYS_CREATE_TS = new Date();
      if (!data.CREATE_DT) data.CREATE_DT = new Date();
      if (!data.TXN_DATE) data.TXN_DATE = new Date();
      
      // Create the SMS record
      const sms = await this.create(data);
      return sms;
    } catch (error) {
      logger.error('Error creating SMS record:', error.message);
      throw error;
    }
  }

  // Instance method to get SMS summary
  getSummary() {
    return {
      externalSmsId: this.EXTERNAL_SMS_ID,
      recipientPhone: this.RECIPIENT_PHONE_NUMBER,
      accountNo: this.ACCT_NO,
      transactionDate: this.TXN_DATE,
      transactionType: this.DR_CR_IND,
      amount: this.TXN_AMT,
      balance: this.ACCT_BALANCE,
      availableBalance: this.DISP_AVAIL_BAL,
      depositorPayee: this.DEPOSITOR_PAYEE_NM,
      messageContent: this.MESSAGE_CONTENT ? this.MESSAGE_CONTENT.substring(0, 100) + '...' : '',
      recordStatus: this.REC_ST,
      createdBy: this.CREATED_BY
    };
  }

  // Instance method to check if SMS is valid
  get isValid() {
    const requiredFields = [
      'EXTERNAL_SMS_ID',
      'RECIPIENT_PHONE_NUMBER',
      'MESSAGE_CONTENT',
      'ACCT_NO',
      'DR_CR_IND'
    ];
    
    for (const field of requiredFields) {
      if (!this[field]) return false;
    }
    
    if (this.TXN_AMT < 0) return false;
    if (!['D', 'C'].includes(this.DR_CR_IND.toUpperCase())) return false;
    
    return true;
  }

  // Virtual getters
  get formattedTransactionType() {
    switch (this.DR_CR_IND?.toUpperCase()) {
      case 'D': return 'Debit';
      case 'C': return 'Credit';
      default: return 'Unknown';
    }
  }

  get formattedTransactionDate() {
    return this.TXN_DATE ? new Date(this.TXN_DATE).toLocaleDateString() : 'N/A';
  }

  get isDebit() {
    return this.DR_CR_IND?.toUpperCase() === 'D';
  }

  get isCredit() {
    return this.DR_CR_IND?.toUpperCase() === 'C';
  }
}

SMS.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  EXTERNAL_SMS_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'External SMS identifier (from SMS gateway)'
  },
  RECIPIENT_PHONE_NUMBER: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Recipient phone number'
  },
  REC_ST: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'A',
    comment: 'Record status (A=Active, I=Inactive, D=Deleted)',
    validate: {
      isIn: [['A', 'I', 'D']]
    }
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row timestamp'
  },
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'User ID who triggered the SMS'
  },
  MESSAGE_CONTENT: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'SMS message content'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation date'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'System creation timestamp'
  },
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Creator identifier'
  },
  ACCT_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Account balance at transaction time',
    validate: {
      min: { args: [0], msg: 'Account balance cannot be negative' }
    }
  },
  TXN_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Transaction amount',
    validate: {
      min: { args: [0], msg: 'Transaction amount cannot be negative' }
    }
  },
  ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Account number'
  },
  DR_CR_IND: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Debit/Credit indicator (D=Debit, C=Credit)',
    validate: {
      isIn: [['D', 'C']]
    },
    set(value) {
      this.setDataValue('DR_CR_IND', value ? value.toUpperCase() : value);
    }
  },
  TXN_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Transaction date'
  },
  DISP_AVAIL_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Display available balance',
    validate: {
      min: { args: [0], msg: 'Available balance cannot be negative' }
    }
  },
  DEPOSITOR_PAYEE_NM: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Depositor/Payee name'
  },
  // Added for compatibility
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'SMS',
  tableName: 'sms_records', // ✅ Fixed: lowercase table name
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  comment: 'SMS notification records',
  
  hooks: {
    beforeValidate: (sms) => {
      // Trim string fields
      const fields = ['EXTERNAL_SMS_ID', 'RECIPIENT_PHONE_NUMBER', 'USER_ID', 
                     'CREATED_BY', 'ACCT_NO', 'DEPOSITOR_PAYEE_NM'];
      for (const field of fields) {
        if (sms[field]) {
          sms[field] = sms[field].trim();
        }
      }
      
      if (sms.DR_CR_IND) {
        sms.DR_CR_IND = sms.DR_CR_IND.toUpperCase();
      }
      if (sms.REC_ST) {
        sms.REC_ST = sms.REC_ST.toUpperCase();
      }
    },
    
    beforeCreate: (sms) => {
      const now = new Date();
      
      if (!sms.ROW_TS) sms.ROW_TS = now;
      if (!sms.SYS_CREATE_TS) sms.SYS_CREATE_TS = now;
      if (!sms.CREATE_DT) sms.CREATE_DT = now;
      if (!sms.TXN_DATE) sms.TXN_DATE = now;
      if (!sms.created_at) sms.created_at = now;
      if (!sms.updated_at) sms.updated_at = now;
      
      // Validate amounts
      if (sms.TXN_AMT <= 0) {
        throw new Error('Transaction amount must be greater than 0');
      }
      if (sms.ACCT_BALANCE < 0) {
        throw new Error('Account balance cannot be negative');
      }
      if (sms.DISP_AVAIL_BAL < 0) {
        throw new Error('Available balance cannot be negative');
      }
    },
    
    beforeUpdate: (sms) => {
      const now = new Date();
      sms.ROW_TS = now;
      sms.updated_at = now;
      
      const immutableFields = ['EXTERNAL_SMS_ID', 'SYS_CREATE_TS', 'CREATE_DT'];
      for (const field of immutableFields) {
        if (sms.changed(field)) {
          throw new Error(`Cannot update immutable field: ${field}`);
        }
      }
    },
    
    afterCreate: (sms) => {
      logger.info(`SMS record created`, {
        externalSmsId: sms.EXTERNAL_SMS_ID,
        recipientPhone: sms.RECIPIENT_PHONE_NUMBER,
        accountNo: sms.ACCT_NO,
        amount: sms.TXN_AMT,
        transactionType: sms.DR_CR_IND
      });
    }
  },
  
  indexes: [
    { fields: ['RECIPIENT_PHONE_NUMBER'], name: 'idx_sms_recipient' },
    { fields: ['ACCT_NO'], name: 'idx_sms_account' },
    { fields: ['EXTERNAL_SMS_ID'], name: 'idx_sms_external_id', unique: true },
    { fields: ['TXN_DATE'], name: 'idx_sms_transaction_date' },
    { fields: ['REC_ST'], name: 'idx_sms_record_status' },
    { fields: ['USER_ID'], name: 'idx_sms_user' },
    { fields: ['CREATE_DT'], name: 'idx_sms_create_dt' }
  ],
  
  scopes: {
    active: { where: { REC_ST: 'A' } },
    inactive: { where: { REC_ST: 'I' } },
    byRecipient: (phone) => ({ where: { RECIPIENT_PHONE_NUMBER: phone } }),
    byAccount: (acctNo) => ({ where: { ACCT_NO: acctNo } }),
    byUser: (userId) => ({ where: { USER_ID: userId } }),
    byDateRange: (start, end) => ({
      where: {
        TXN_DATE: { [Op.between]: [start, end] }
      }
    }),
    today: {
      where: {
        TXN_DATE: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    },
    credits: { where: { DR_CR_IND: 'C' } },
    debits: { where: { DR_CR_IND: 'D' } }
  }
});

// Ensure table exists
SMS.ensureTable = async function() {
  try {
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'sms_records'`
    );
    
    if (result[0].count === 0) {
      console.log('📝 Creating sms_records table...');
      await this.sync({ force: false });
      console.log('✅ sms_records table created');
    } else {
      console.log('✅ sms_records table verified');
    }
    return true;
  } catch (error) {
    console.error('❌ Error ensuring sms_records table:', error.message);
    return false;
  }
};

export default SMS;
