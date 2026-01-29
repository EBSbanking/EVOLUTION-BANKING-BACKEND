import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const RECORD_STATUS = {
  ACTIVE: 'A',
  INACTIVE: 'I',
  PENDING: 'P'
};

export const REPAIR_FLAG = {
  YES: 'Y',
  NO: 'N'
};

export const FOREIGN_IFT_FLAG = {
  YES: 'Y',
  NO: 'N'
};

class InwardFundsTransfer extends Model {
  // Static method to find by transfer ID
  static async findByTransferId(transferId, options = {}) {
    return await this.findOne({
      where: { INWD_FUNDS_XFER_ID: transferId },
      ...options
    });
  }

  // Static method to find by reference number
  static async findByReference(xferRef, options = {}) {
    return await this.findOne({
      where: { XFER_REF: xferRef },
      ...options
    });
  }

  // Static method to find by beneficiary account
  static async findByBeneficiaryAccount(accountNo, options = {}) {
    const defaultOptions = {
      where: { BENEFICIARY_ACCT: accountNo },
      order: [['VALUE_DT', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find pending transfers
  static async findPendingTransfers(options = {}) {
    const defaultOptions = {
      where: { REC_ST: RECORD_STATUS.PENDING },
      order: [['VALUE_DT', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find active transfers
  static async findActiveTransfers(options = {}) {
    const defaultOptions = {
      where: { REC_ST: RECORD_STATUS.ACTIVE },
      order: [['VALUE_DT', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find transfers by date range
  static async findByDateRange(startDate, endDate, options = {}) {
    const defaultOptions = {
      where: {
        VALUE_DT: {
          [DataTypes.Op.between]: [startDate, endDate]
        }
      },
      order: [['VALUE_DT', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find foreign transfers
  static async findForeignTransfers(options = {}) {
    const defaultOptions = {
      where: { 
        FOREIGN_IFT_FG: FOREIGN_IFT_FLAG.YES,
        REC_ST: RECORD_STATUS.ACTIVE
      },
      order: [['VALUE_DT', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to get transfer statistics
  static async getStatistics(startDate, endDate) {
    const result = await this.findAll({
      attributes: [
        'REC_ST',
        'FOREIGN_IFT_FG',
        [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'transferCount'],
        [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('XFER_AMT')), 'averageAmount']
      ],
      where: {
        VALUE_DT: {
          [DataTypes.Op.between]: [startDate, endDate]
        }
      },
      group: ['REC_ST', 'FOREIGN_IFT_FG'],
      raw: true
    });
    
    return result.reduce((stats, row) => {
      const status = row.REC_ST;
      const isForeign = row.FOREIGN_IFT_FG;
      
      if (!stats[status]) {
        stats[status] = {
          domestic: { count: 0, amount: 0 },
          foreign: { count: 0, amount: 0 }
        };
      }
      
      const type = isForeign === FOREIGN_IFT_FLAG.YES ? 'foreign' : 'domestic';
      stats[status][type].count = parseInt(row.transferCount);
      stats[status][type].amount = parseFloat(row.totalAmount) || 0;
      
      return stats;
    }, {});
  }

  // Instance method to approve transfer
  async approve(userId, options = {}) {
    if (this.REC_ST === RECORD_STATUS.ACTIVE) {
      throw new Error('Transfer is already active');
    }
    
    // Process the transfer (this would trigger the hooks)
    this.REC_ST = RECORD_STATUS.ACTIVE;
    this.USER_ID = userId;
    this.ROW_TS = new Date();
    
    return await this.save(options);
  }

  // Instance method to calculate net amount
  calculateNetAmount() {
    const xferAmount = parseFloat(this.XFER_AMT) || 0;
    const sendingCharges = parseFloat(this.SENDING_BANK_CHRG) || 0;
    const receivingCharges = parseFloat(this.RECIEVING_BANK_CHRG) || 0;
    const totalCharges = parseFloat(this.TOTAL_CHRG) || 0;
    
    // Use total charges if provided, otherwise calculate from sending + receiving
    const charges = totalCharges > 0 ? totalCharges : (sendingCharges + receivingCharges);
    
    return xferAmount - charges;
  }

  // Instance method to calculate local currency equivalent
  calculateLocalCurrencyEquivalent() {
    const payAmount = parseFloat(this.PAY_AMT) || 0;
    const exchangeRate = parseFloat(this.PAY_EXCH_RATE) || 1;
    
    return payAmount * exchangeRate;
  }

  // Instance method to get transfer summary
  getSummary() {
    return {
      transferId: this.INWD_FUNDS_XFER_ID,
      reference: this.XFER_REF,
      amount: parseFloat(this.XFER_AMT) || 0,
      currencyId: this.XFER_CRNCY_ID,
      beneficiaryName: this.BENEFICIARY_NM,
      beneficiaryAccount: this.BENEFICIARY_ACCT,
      remitterName: this.REMITTER_NM,
      valueDate: this.VALUE_DT,
      status: this.REC_ST,
      netAmount: this.calculateNetAmount(),
      localCurrencyEquivalent: this.calculateLocalCurrencyEquivalent(),
      isForeign: this.FOREIGN_IFT_FG === FOREIGN_IFT_FLAG.YES,
      requiresRepair: this.REPAIR_FG === REPAIR_FLAG.YES
    };
  }

  // Virtual getter for formatted status
  get formattedStatus() {
    switch (this.REC_ST) {
      case RECORD_STATUS.ACTIVE:
        return 'Active';
      case RECORD_STATUS.INACTIVE:
        return 'Inactive';
      case RECORD_STATUS.PENDING:
        return 'Pending';
      default:
        return 'Unknown';
    }
  }

  // Virtual getter for formatted foreign flag
  get isForeignTransfer() {
    return this.FOREIGN_IFT_FG === FOREIGN_IFT_FLAG.YES;
  }

  // Virtual getter for formatted repair flag
  get requiresRepair() {
    return this.REPAIR_FG === REPAIR_FLAG.YES;
  }
}

InwardFundsTransfer.init({
  INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Inward Funds Transfer Identifier'
  },
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Transfer Reference Number'
  },
  PAYMENT_MTD_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Payment Method Code'
  },
  CHARGES_PAYER_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Charges Payer Code'
  },
  XFER_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Transfer Currency Identifier'
  },
  XFER_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Transfer Amount'
  },
  SENDING_BANK_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Sending Bank Charges'
  },
  RECIEVING_BANK_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Receiving Bank Charges'
  },
  TOTAL_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Total Charges'
  },
  NET_AMT_XFERED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Net Amount Transferred'
  },
  PAY_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Payment Currency Identifier'
  },
  PAY_EXCH_RATE: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: false,
    comment: 'Payment Exchange Rate'
  },
  PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Payment Amount'
  },
  LCY_EQIVALENT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Local Currency Equivalent'
  },
  VALUE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Value Date'
  },
  PRIORITY_LEVEL_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Priority Level Code'
  },
  SUPPLEMENTARY_REF: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Supplementary Reference'
  },
  XFER_PURPOSE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Transfer Purpose Identifier'
  },
  PAY_DETAILS: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    comment: 'Payment Details'
  },
  FUNDS_XFER_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Funds Transfer Type Identifier'
  },
  BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Business Unit Identifier'
  },
  BENEFICIARY_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Beneficiary Name'
  },
  BENEFICIARY_ACCT: {
    type: DataTypes.STRING(60),
    allowNull: false,
    comment: 'Beneficiary Account'
  },
  BENEFICIARY_ADDR_LINE1: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Beneficiary Address Line 1'
  },
  BENEFICIARY_ADDR_LINE2: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Beneficiary Address Line 2'
  },
  BENEFICIARY_ADDR_LINE3: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Beneficiary Address Line 3'
  },
  BENEFICIARY_ADDR_LINE4: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Beneficiary Address Line 4'
  },
  BENEFICIARY_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Beneficiary Telephone Number'
  },
  BENEFICIARY_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Beneficiary BIC Identifier'
  },
  BENEFICIARY_BANK_NM: {
    type: DataTypes.STRING(60),
    allowNull: false,
    comment: 'Beneficiary Bank Name'
  },
  BENEFICIARY_BRANCH: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Beneficiary Branch'
  },
  BENEFICIARY_BANK_CITY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Beneficiary Bank City Identifier'
  },
  BENEFICIARY_BANK_STATE_COUNTY: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Beneficiary Bank State/County'
  },
  BENEFICIARY_BANK_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Beneficiary Bank Country Identifier'
  },
  BENEFICIARY_BANK_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Beneficiary Bank Telephone Number'
  },
  REMITTER_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Remitter Name'
  },
  REMITTER_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Account Number'
  },
  REMITTER_ADDR_LINE1: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Remitter Address Line 1'
  },
  REMITTER_ADDR_LINE2: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Remitter Address Line 2'
  },
  REMITTER_ADDR_LINE3: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Remitter Address Line 3'
  },
  REMITTER_ADDR_LINE4: {
    type: DataTypes.STRING(35),
    allowNull: true,
    comment: 'Remitter Address Line 4'
  },
  REMITTER_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Telephone Number'
  },
  BENEFICIARY_IDENT_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Beneficiary Identification Type Identifier'
  },
  REMITTER_IDENT_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Remitter Identification Type Identifier'
  },
  REMITTER_IDENT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Identification Number'
  },
  REMITTER_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Remitter BIC Identifier'
  },
  REMITTER_BANK_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Bank Name'
  },
  REMITTER_BRANCH_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Branch Name'
  },
  REMITTER_BANK_CITY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Remitter Bank City Identifier'
  },
  REMITTER_BANK_STATE_COUNTY: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Bank State/County'
  },
  REMITTER_BANK_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Remitter Bank Telephone Number'
  },
  REMITTER_BANK_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Remitter Bank Country Identifier'
  },
  SENDING_INSTITUTION_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Sending Institution Bank Identifier'
  },
  ORDERING_INSTITUTION_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Ordering Institution Bank Identifier'
  },
  SENDER_CORRESPONDENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Sender Correspondent Bank Identifier'
  },
  RECIEVER_CORRESPONDENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Receiver Correspondent Bank Identifier'
  },
  THIRD_REIMBURSEMENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Third Reimbursement Bank Identifier'
  },
  INTERMEDIARY_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Intermediary Bank Identifier'
  },
  REC_ST: {
    type: DataTypes.ENUM(Object.values(RECORD_STATUS)),
    allowNull: false,
    defaultValue: RECORD_STATUS.PENDING,
    comment: 'Record Status'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version Number'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row Timestamp'
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User Identifier'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation Date'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created By'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'System Creation Timestamp'
  },
  ADDTL_INSTRUCTION1: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'Additional Instruction 1'
  },
  ADDTL_INSTRUCTION2: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'Additional Instruction 2'
  },
  ADDTL_INSTRUCTION3: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'Additional Instruction 3'
  },
  ADDTL_INSTRUCTION4: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'Additional Instruction 4'
  },
  BENEFICIARY_SECRET_QA: {
    type: DataTypes.STRING(256),
    allowNull: true,
    comment: 'Beneficiary Secret Question/Answer'
  },
  SPEC_INSTRUCTION: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    comment: 'Special Instructions'
  },
  EXT_INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'External Inward Funds Transfer Identifier'
  },
  BENEFICIARY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Beneficiary Identifier'
  },
  REPAIR_FG: {
    type: DataTypes.ENUM(Object.values(REPAIR_FLAG)),
    allowNull: false,
    defaultValue: REPAIR_FLAG.NO,
    comment: 'Repair Flag'
  },
  FOREIGN_IFT_FG: {
    type: DataTypes.ENUM(Object.values(FOREIGN_IFT_FLAG)),
    allowNull: false,
    defaultValue: FOREIGN_IFT_FLAG.NO,
    comment: 'Foreign Inward Funds Transfer Flag'
  },
  ADDTL_INSTR1_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Additional Instruction 1 Code'
  },
  ADDTL_INSTR2_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Additional Instruction 2 Code'
  },
  ADDTL_INSTR3_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Additional Instruction 3 Code'
  },
  ADDTL_INSTR4_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Additional Instruction 4 Code'
  }
}, {
  sequelize,
  modelName: 'InwardFundsTransfer',
  tableName: 'INWARD_FUNDS_TRANSFERS',
  timestamps: false, // Using custom timestamp fields
  comment: 'Inward Funds Transfers',
  indexes: [
    {
      name: 'idx_xfer_ref',
      fields: ['XFER_REF']
    },
    {
      name: 'idx_beneficiary_acct',
      fields: ['BENEFICIARY_ACCT']
    },
    {
      name: 'idx_rec_st',
      fields: ['REC_ST']
    },
    {
      name: 'idx_value_dt',
      fields: ['VALUE_DT']
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
      name: 'idx_foreign_ift',
      fields: ['FOREIGN_IFT_FG']
    },
    {
      name: 'idx_repair_fg',
      fields: ['REPAIR_FG']
    },
    {
      name: 'idx_beneficiary_name',
      fields: ['BENEFICIARY_NM']
    },
    {
      name: 'idx_remitter_name',
      fields: ['REMITTER_NM']
    },
    {
      name: 'idx_xfer_currency',
      fields: ['XFER_CRNCY_ID']
    },
    {
      name: 'idx_composite_status_date',
      fields: ['REC_ST', 'VALUE_DT']
    },
    {
      name: 'idx_composite_acct_date',
      fields: ['BENEFICIARY_ACCT', 'VALUE_DT']
    },
    {
      name: 'idx_composite_ref_status',
      fields: ['XFER_REF', 'REC_ST']
    }
  ],
  hooks: {
    beforeValidate: (transfer, options) => {
      // Trim string fields
      const stringFields = [
        'XFER_REF', 'PAYMENT_MTD_CD', 'CHARGES_PAYER_CD', 'PRIORITY_LEVEL_CD',
        'SUPPLEMENTARY_REF', 'PAY_DETAILS', 'BENEFICIARY_NM', 'BENEFICIARY_ACCT',
        'BENEFICIARY_ADDR_LINE1', 'BENEFICIARY_ADDR_LINE2', 'BENEFICIARY_ADDR_LINE3',
        'BENEFICIARY_ADDR_LINE4', 'BENEFICIARY_TEL_NO', 'BENEFICIARY_BANK_NM',
        'BENEFICIARY_BRANCH', 'BENEFICIARY_BANK_STATE_COUNTY', 'BENEFICIARY_BANK_TEL_NO',
        'REMITTER_NM', 'REMITTER_ACCT_NO', 'REMITTER_ADDR_LINE1', 'REMITTER_ADDR_LINE2',
        'REMITTER_ADDR_LINE3', 'REMITTER_ADDR_LINE4', 'REMITTER_TEL_NO',
        'REMITTER_IDENT_NO', 'REMITTER_BANK_NM', 'REMITTER_BRANCH_NM',
        'REMITTER_BANK_STATE_COUNTY', 'REMITTER_BANK_TEL_NO', 'USER_ID', 'CREATED_BY',
        'ADDTL_INSTRUCTION1', 'ADDTL_INSTRUCTION2', 'ADDTL_INSTRUCTION3',
        'ADDTL_INSTRUCTION4', 'BENEFICIARY_SECRET_QA', 'SPEC_INSTRUCTION',
        'ADDTL_INSTR1_CD', 'ADDTL_INSTR2_CD', 'ADDTL_INSTR3_CD', 'ADDTL_INSTR4_CD'
      ];
      
      stringFields.forEach(field => {
        if (transfer[field] && typeof transfer[field] === 'string') {
          transfer[field] = transfer[field].trim();
        }
      });
    },
    
    beforeCreate: (transfer, options) => {
      // Set timestamps if not provided
      if (!transfer.ROW_TS) {
        transfer.ROW_TS = new Date();
      }
      if (!transfer.CREATE_DT) {
        transfer.CREATE_DT = new Date();
      }
      if (!transfer.SYS_CREATE_TS) {
        transfer.SYS_CREATE_TS = new Date();
      }
      
      // Calculate derived amounts if not provided
      if (!transfer.NET_AMT_XFERED && transfer.XFER_AMT) {
        const netAmount = transfer.calculateNetAmount();
        transfer.NET_AMT_XFERED = netAmount;
      }
      
      if (!transfer.LCY_EQIVALENT && transfer.PAY_AMT && transfer.PAY_EXCH_RATE) {
        const lcyEquivalent = transfer.calculateLocalCurrencyEquivalent();
        transfer.LCY_EQIVALENT = lcyEquivalent;
      }
      
      // Validate value date is not in the future
      if (transfer.VALUE_DT > new Date()) {
        throw new Error('Value date cannot be in the future');
      }
      
      // Validate amounts are positive
      if (transfer.XFER_AMT <= 0) {
        throw new Error('Transfer amount must be positive');
      }
      
      if (transfer.PAY_EXCH_RATE <= 0) {
        throw new Error('Exchange rate must be positive');
      }
    },
    
    beforeUpdate: (transfer, options) => {
      // Update ROW_TS on modification
      transfer.ROW_TS = new Date();
      
      // Increment version number
      if (transfer.changed()) {
        transfer.VERSION_NO = (transfer.VERSION_NO || 0) + 1;
      }
      
      // Prevent changing certain fields if status is active
      if (transfer.REC_ST === RECORD_STATUS.ACTIVE && !transfer.isNewRecord) {
        const immutableFields = [
          'INWD_FUNDS_XFER_ID', 'XFER_REF', 'BENEFICIARY_ACCT',
          'XFER_AMT', 'XFER_CRNCY_ID', 'VALUE_DT', 'CREATE_DT',
          'SYS_CREATE_TS', 'CREATED_BY'
        ];
        
        for (const field of immutableFields) {
          if (transfer.changed(field)) {
            throw new Error(`Cannot change ${field} when transfer is active`);
          }
        }
      }
      
      // When status changes to active, process the transfer
      if (transfer.changed('REC_ST') && transfer.REC_ST === RECORD_STATUS.ACTIVE) {
        // This will be processed in the afterUpdate hook
      }
    },
    
    afterUpdate: async (transfer, options) => {
      // Process transfer when status changes to active
      if (transfer.changed('REC_ST') && transfer.REC_ST === RECORD_STATUS.ACTIVE) {
        try {
          await transfer.processTransfer(options.transaction);
        } catch (error) {
          logger.error(`Failed to process transfer ${transfer.INWD_FUNDS_XFER_ID}`, {
            error: error.message,
            transferId: transfer.INWD_FUNDS_XFER_ID,
            beneficiaryAccount: transfer.BENEFICIARY_ACCT
          });
          
          // Rollback the status change
          throw error;
        }
      }
      
      if (transfer.changed('REC_ST')) {
        logger.info(`Transfer status changed`, {
          transferId: transfer.INWD_FUNDS_XFER_ID,
          oldStatus: transfer.previous('REC_ST'),
          newStatus: transfer.REC_ST,
          reference: transfer.XFER_REF
        });
      }
    },
    
    afterCreate: (transfer, options) => {
      logger.info(`Inward funds transfer created`, {
        transferId: transfer.INWD_FUNDS_XFER_ID,
        reference: transfer.XFER_REF,
        amount: transfer.XFER_AMT,
        beneficiaryAccount: transfer.BENEFICIARY_ACCT,
        status: transfer.REC_ST
      });
    }
  }
});

// Add processTransfer method to the prototype
InwardFundsTransfer.prototype.processTransfer = async function(transaction = null) {
  const options = transaction ? { transaction } : {};
  
  try {
    // Find customer account
    const CustomerAccount = sequelize.models.CustomerAccount;
    const PendingGLTransaction = sequelize.models.PendingGLTransaction;
    
    if (!CustomerAccount || !PendingGLTransaction) {
      throw new Error('Required models are not available');
    }
    
    const account = await CustomerAccount.findOne({
      where: { ACCT_NO: this.BENEFICIARY_ACCT },
      ...options
    });
    
    if (!account) {
      throw new Error(`CustomerAccount with ACCT_NO ${this.BENEFICIARY_ACCT} not found`);
    }
    
    // Calculate net amount
    const netAmount = this.calculateNetAmount();
    if (netAmount <= 0) {
      throw new Error('Net amount must be positive');
    }
    
    // Update customer account balances
    account.LEDGER_BAL = (parseFloat(account.LEDGER_BAL) || 0) + netAmount;
    account.CLEARED_BAL = (parseFloat(account.CLEARED_BAL) || 0) + netAmount;
    account.AVAILABLE_BALANCE = (parseFloat(account.AVAILABLE_BALANCE) || 0) + netAmount;
    account.lastActivityDate = new Date();
    
    await account.save(options);
    
    // Create GL transaction entries
    const creditEntry = await PendingGLTransaction.create({
      INWD_FUNDS_XFER_ID: this.INWD_FUNDS_XFER_ID,
      XFER_REF: this.XFER_REF,
      GL_ACCT_NO: this.BENEFICIARY_ACCT,
      TRANSACTION_TYPE: 'CREDIT',
      AMOUNT: netAmount,
      CRNCY_ID: this.XFER_CRNCY_ID,
      TRANSACTION_DATE: this.VALUE_DT,
      CREATED_BY: this.CREATED_BY,
      JOURNAL_ID: this.INWD_FUNDS_XFER_ID,
      STATUS: 'PENDING'
    }, options);
    
    const debitEntry = await PendingGLTransaction.create({
      INWD_FUNDS_XFER_ID: this.INWD_FUNDS_XFER_ID,
      XFER_REF: this.XFER_REF,
      GL_ACCT_NO: 'SUSPENSE_GL_ACCOUNT', // Replace with actual GL account number
      TRANSACTION_TYPE: 'DEBIT',
      AMOUNT: netAmount,
      CRNCY_ID: this.XFER_CRNCY_ID,
      TRANSACTION_DATE: this.VALUE_DT,
      CREATED_BY: this.CREATED_BY,
      JOURNAL_ID: this.INWD_FUNDS_XFER_ID,
      STATUS: 'PENDING'
    }, options);
    
    logger.info(`Transfer processed successfully`, {
      transferId: this.INWD_FUNDS_XFER_ID,
      beneficiaryAccount: this.BENEFICIARY_ACCT,
      netAmount: netAmount,
      creditTransactionId: creditEntry.id,
      debitTransactionId: debitEntry.id
    });
    
    return { account, creditEntry, debitEntry };
    
  } catch (error) {
    logger.error(`Error processing transfer ${this.INWD_FUNDS_XFER_ID}`, {
      error: error.message,
      transferId: this.INWD_FUNDS_XFER_ID,
      beneficiaryAccount: this.BENEFICIARY_ACCT
    });
    throw error;
  }
};

export default InwardFundsTransfer;