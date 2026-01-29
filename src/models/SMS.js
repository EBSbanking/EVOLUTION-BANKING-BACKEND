import { DataTypes, Model } from 'sequelize';
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
          [DataTypes.Op.between]: [startDate, endDate]
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
          [DataTypes.Op.between]: [startDate, endDate]
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
      messageContent: this.MESSAGE_CONTENT.substring(0, 100) + '...',
      recordStatus: this.REC_ST,
      createdBy: this.CREATED_BY
    };
  }

  // Instance method to check if SMS is valid
  get isValid() {
    // Validate required fields
    const requiredFields = [
      'EXTERNAL_SMS_ID',
      'RECIPIENT_PHONE_NUMBER',
      'REC_ST',
      'MESSAGE_CONTENT',
      'ACCT_NO',
      'DR_CR_IND'
    ];
    
    for (const field of requiredFields) {
      if (!this[field]) return false;
    }
    
    // Validate transaction amount
    if (this.TXN_AMT < 0) return false;
    
    // Validate debit/credit indicator
    if (!['D', 'C'].includes(this.DR_CR_IND.toUpperCase())) return false;
    
    // Validate dates
    if (this.TXN_DATE > new Date()) return false;
    if (this.CREATE_DT > new Date()) return false;
    if (this.SYS_CREATE_TS > new Date()) return false;
    
    return true;
  }

  // Virtual getter for formatted transaction type
  get formattedTransactionType() {
    switch (this.DR_CR_IND.toUpperCase()) {
      case 'D':
        return 'Debit';
      case 'C':
        return 'Credit';
      default:
        return 'Unknown';
    }
  }

  // Virtual getter for formatted transaction date
  get formattedTransactionDate() {
    return this.TXN_DATE ? this.TXN_DATE.toLocaleDateString() : 'N/A';
  }

  // Virtual getter for transaction direction
  get isDebit() {
    return this.DR_CR_IND.toUpperCase() === 'D';
  }

  get isCredit() {
    return this.DR_CR_IND.toUpperCase() === 'C';
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
      isIn: {
        args: [['A', 'I', 'D']],
        msg: 'REC_ST must be A, I, or D'
      }
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
    comment: 'Account balance at transaction time',
    validate: {
      min: {
        args: [0],
        msg: 'Account balance cannot be negative'
      }
    }
  },
  TXN_AMT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Transaction amount',
    validate: {
      min: {
        args: [0],
        msg: 'Transaction amount cannot be negative'
      }
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
      isIn: {
        args: [['D', 'C', 'd', 'c']],
        msg: 'DR_CR_IND must be D or C'
      }
    },
    set(value) {
      // Always store in uppercase
      this.setDataValue('DR_CR_IND', value ? value.toUpperCase() : value);
    }
  },
  TXN_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Transaction date'
  },
  DISP_AVAIL_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Display available balance',
    validate: {
      min: {
        args: [0],
        msg: 'Available balance cannot be negative'
      }
    }
  },
  DEPOSITOR_PAYEE_NM: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Depositor/Payee name'
  }
}, {
  sequelize,
  modelName: 'SMS',
  tableName: 'SMS_RECORDS',
  timestamps: false, // Using custom timestamp fields instead
  comment: 'SMS notification records',
  indexes: [
    {
      name: 'idx_external_sms_id',
      fields: ['EXTERNAL_SMS_ID'],
      unique: true
    },
    {
      name: 'idx_recipient_phone',
      fields: ['RECIPIENT_PHONE_NUMBER']
    },
    {
      name: 'idx_account_no',
      fields: ['ACCT_NO']
    },
    {
      name: 'idx_txn_date',
      fields: ['TXN_DATE']
    },
    {
      name: 'idx_dr_cr_ind',
      fields: ['DR_CR_IND']
    },
    {
      name: 'idx_rec_st',
      fields: ['REC_ST']
    },
    {
      name: 'idx_created_by',
      fields: ['CREATED_BY']
    },
    {
      name: 'idx_create_dt',
      fields: ['CREATE_DT']
    },
    {
      name: 'idx_sys_create_ts',
      fields: ['SYS_CREATE_TS']
    },
    {
      name: 'idx_composite_phone_date',
      fields: ['RECIPIENT_PHONE_NUMBER', 'TXN_DATE']
    },
    {
      name: 'idx_composite_account_date',
      fields: ['ACCT_NO', 'TXN_DATE']
    },
    {
      name: 'idx_composite_ext_date',
      fields: ['EXTERNAL_SMS_ID', 'TXN_DATE']
    }
  ],
  hooks: {
    beforeValidate: (sms, options) => {
      // Trim string fields
      if (sms.EXTERNAL_SMS_ID) sms.EXTERNAL_SMS_ID = sms.EXTERNAL_SMS_ID.trim();
      if (sms.RECIPIENT_PHONE_NUMBER) sms.RECIPIENT_PHONE_NUMBER = sms.RECIPIENT_PHONE_NUMBER.trim();
      if (sms.USER_ID) sms.USER_ID = sms.USER_ID.trim();
      if (sms.CREATED_BY) sms.CREATED_BY = sms.CREATED_BY.trim();
      if (sms.ACCT_NO) sms.ACCT_NO = sms.ACCT_NO.trim();
      if (sms.DEPOSITOR_PAYEE_NM) sms.DEPOSITOR_PAYEE_NM = sms.DEPOSITOR_PAYEE_NM.trim();
      
      // Ensure DR_CR_IND is uppercase
      if (sms.DR_CR_IND) {
        sms.DR_CR_IND = sms.DR_CR_IND.toUpperCase();
      }
      
      // Ensure REC_ST is uppercase
      if (sms.REC_ST) {
        sms.REC_ST = sms.REC_ST.toUpperCase();
      }
    },
    
    beforeCreate: (sms, options) => {
      // Set ROW_TS if not provided
      if (!sms.ROW_TS) {
        sms.ROW_TS = new Date();
      }
      
      // Set SYS_CREATE_TS if not provided
      if (!sms.SYS_CREATE_TS) {
        sms.SYS_CREATE_TS = new Date();
      }
      
      // Set CREATE_DT if not provided
      if (!sms.CREATE_DT) {
        sms.CREATE_DT = new Date();
      }
      
      // Set TXN_DATE if not provided
      if (!sms.TXN_DATE) {
        sms.TXN_DATE = new Date();
      }
      
      // Validate dates are not in the future
      const now = new Date();
      if (sms.TXN_DATE > now) {
        throw new Error('Transaction date cannot be in the future');
      }
      if (sms.CREATE_DT > now) {
        throw new Error('Creation date cannot be in the future');
      }
      
      // Validate transaction amount matches debit/credit
      if (sms.TXN_AMT <= 0) {
        throw new Error('Transaction amount must be greater than 0');
      }
      
      // Validate balances are not negative
      if (sms.ACCT_BALANCE < 0) {
        throw new Error('Account balance cannot be negative');
      }
      if (sms.DISP_AVAIL_BAL < 0) {
        throw new Error('Available balance cannot be negative');
      }
    },
    
    beforeUpdate: (sms, options) => {
      // Update ROW_TS on modification
      sms.ROW_TS = new Date();
      
      // Prevent updating certain fields
      const immutableFields = ['EXTERNAL_SMS_ID', 'SYS_CREATE_TS', 'CREATE_DT'];
      for (const field of immutableFields) {
        if (sms.changed(field)) {
          throw new Error(`Cannot update immutable field: ${field}`);
        }
      }
      
      // Validate if updating debit/credit indicator
      if (sms.changed('DR_CR_IND')) {
        const oldValue = sms.previous('DR_CR_IND');
        const newValue = sms.DR_CR_IND;
        
        if (oldValue.toUpperCase() !== newValue.toUpperCase()) {
          logger.warn(`DR_CR_IND changed from ${oldValue} to ${newValue}`, {
            externalSmsId: sms.EXTERNAL_SMS_ID
          });
        }
      }
    },
    
    afterCreate: (sms, options) => {
      logger.info(`SMS record created`, {
        externalSmsId: sms.EXTERNAL_SMS_ID,
        recipientPhone: sms.RECIPIENT_PHONE_NUMBER,
        accountNo: sms.ACCT_NO,
        amount: sms.TXN_AMT,
        transactionType: sms.DR_CR_IND
      });
    },
    
    afterUpdate: (sms, options) => {
      if (sms.changed('REC_ST')) {
        logger.info(`SMS record status changed`, {
          externalSmsId: sms.EXTERNAL_SMS_ID,
          oldStatus: sms.previous('REC_ST'),
          newStatus: sms.REC_ST
        });
      }
    }
  }
});

export default SMS;