// models/DepositAccountInterestOption.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterestOption extends Model {
  // Static method: Find options by deposit account ID
  static async findByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_ID: depositAccountId },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method: Find active options by deposit account ID
  static async findActiveByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { 
        DEPOSIT_ACCT_ID: depositAccountId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method: Find by settlement account IDs
  static async findBySettlementAccounts(crAccountId, drAccountId) {
    return this.findAll({
      where: {
        CR_SETLMNT_ACCT_ID: crAccountId,
        DR_SETLMNT_ACCT_ID: drAccountId,
        REC_ST: 'A'
      }
    });
  }

  // Static method: Find by created user
  static async findByCreatedBy(createdBy) {
    return this.findAll({
      where: { CREATED_BY: createdBy },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method: Get options summary
  static async getOptionsSummary(depositAccountId = null) {
    const whereClause = depositAccountId ? { DEPOSIT_ACCT_ID: depositAccountId } : {};
    
    const options = await this.findAll({
      where: whereClause,
      order: [['DEPOSIT_ACCT_ID', 'ASC'], ['CREATE_DT', 'DESC']]
    });

    const summary = {
      totalOptions: options.length,
      activeOptions: options.filter(o => o.REC_ST === 'A').length,
      inactiveOptions: options.filter(o => o.REC_ST === 'I').length,
      bySettlementType: {
        credit: options.filter(o => o.CR_SETLMNT_OPTION_CD).length,
        debit: options.filter(o => o.DR_SETLMNT_OPTION_CD).length,
        charge: options.filter(o => o.CHRG_SETLMNT_OPTN_CD).length
      },
      byDepositAccount: {}
    };

    // Group by deposit account
    options.forEach(option => {
      const accountId = option.DEPOSIT_ACCT_ID;
      if (!summary.byDepositAccount[accountId]) {
        summary.byDepositAccount[accountId] = {
          total: 0,
          active: 0,
          creditOptions: 0,
          debitOptions: 0,
          chargeOptions: 0
        };
      }
      
      summary.byDepositAccount[accountId].total++;
      if (option.REC_ST === 'A') summary.byDepositAccount[accountId].active++;
      if (option.CR_SETLMNT_OPTION_CD) summary.byDepositAccount[accountId].creditOptions++;
      if (option.DR_SETLMNT_OPTION_CD) summary.byDepositAccount[accountId].debitOptions++;
      if (option.CHRG_SETLMNT_OPTN_CD) summary.byDepositAccount[accountId].chargeOptions++;
    });

    return summary;
  }

  // Static method: Validate settlement options
  static async validateSettlementOptions(depositAccountId, options) {
    const errors = [];
    
    // Check if account already has active options
    const existingOptions = await this.findActiveByDepositAccountId(depositAccountId);
    
    if (existingOptions.length > 0 && options.REC_ST === 'A') {
      // Check for duplicate active options
      const duplicate = existingOptions.find(opt => 
        opt.CR_SETLMNT_ACCT_ID === options.CR_SETLMNT_ACCT_ID &&
        opt.DR_SETLMNT_ACCT_ID === options.DR_SETLMNT_ACCT_ID &&
        opt.CHRG_SETLMNT_ACCT_ID === options.CHRG_SETLMNT_ACCT_ID
      );
      
      if (duplicate) {
        errors.push('Duplicate active settlement options already exist for this account');
      }
    }

    // Validate required fields based on option codes
    if (options.CR_SETLMNT_OPTION_CD && !options.CR_SETLMNT_ACCT_ID) {
      errors.push('Credit settlement account ID is required when credit settlement option is provided');
    }

    if (options.DR_SETLMNT_OPTION_CD && !options.DR_SETLMNT_ACCT_ID) {
      errors.push('Debit settlement account ID is required when debit settlement option is provided');
    }

    if (options.CHRG_SETLMNT_OPTN_CD && !options.CHRG_SETLMNT_ACCT_ID) {
      errors.push('Charge settlement account ID is required when charge settlement option is provided');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Instance method: Get option details
  getOptionDetails() {
    return {
      optionId: this.id,
      depositAccountId: this.DEPOSIT_ACCT_ID,
      creditSettlement: {
        accountId: this.CR_SETLMNT_ACCT_ID,
        optionCode: this.CR_SETLMNT_OPTION_CD,
        accountNumber: this.CR_SETLMNT_ACCT_NO,
        customerName: this.CR_SETLMNT_CUST_NM,
        bicId: this.CR_SETLMNT_BIC_ID
      },
      debitSettlement: {
        accountId: this.DR_SETLMNT_ACCT_ID,
        optionCode: this.DR_SETLMNT_OPTION_CD,
        accountNumber: this.DR_SETLMNT_ACCT_NO,
        customerName: this.DR_SETLMNT_CUST_NM,
        bicId: this.DR_SETLMNT_BIC_ID
      },
      chargeSettlement: {
        accountId: this.CHRG_SETLMNT_ACCT_ID,
        optionCode: this.CHRG_SETLMNT_OPTN_CD,
        accountNumber: this.CHRG_SETLMNT_ACCT_NO,
        customerName: this.CHRG_SETLMNT_CUST_NM,
        bicId: this.CHRG_SETLMNT_BIC_ID
      },
      status: this.REC_ST,
      version: this.VERSION_NO,
      createdBy: this.CREATED_BY,
      createdDate: this.CREATE_DT,
      userId: this.USER_ID,
      systemCreateTimestamp: this.SYS_CREATE_TS,
      rowTimestamp: this.ROW_TS
    };
  }

  // Instance method: Check if option is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Instance method: Check if has credit settlement
  hasCreditSettlement() {
    return !!this.CR_SETLMNT_OPTION_CD;
  }

  // Instance method: Check if has debit settlement
  hasDebitSettlement() {
    return !!this.DR_SETLMNT_OPTION_CD;
  }

  // Instance method: Check if has charge settlement
  hasChargeSettlement() {
    return !!this.CHRG_SETLMNT_OPTN_CD;
  }

  // Virtual getter: Settlement summary
  get settlementSummary() {
    const settlements = [];
    
    if (this.hasCreditSettlement()) {
      settlements.push({
        type: 'Credit',
        account: this.CR_SETLMNT_ACCT_NO,
        customer: this.CR_SETLMNT_CUST_NM,
        option: this.CR_SETLMNT_OPTION_CD
      });
    }
    
    if (this.hasDebitSettlement()) {
      settlements.push({
        type: 'Debit',
        account: this.DR_SETLMNT_ACCT_NO,
        customer: this.DR_SETLMNT_CUST_NM,
        option: this.DR_SETLMNT_OPTION_CD
      });
    }
    
    if (this.hasChargeSettlement()) {
      settlements.push({
        type: 'Charge',
        account: this.CHRG_SETLMNT_ACCT_NO,
        customer: this.CHRG_SETLMNT_CUST_NM,
        option: this.CHRG_SETLMNT_OPTN_CD
      });
    }
    
    return settlements;
  }

  // Virtual getter: Formatted creation date
  get formattedCreateDate() {
    return this.CREATE_DT.toLocaleDateString();
  }

  // Virtual getter: Is complete setup?
  get isCompleteSetup() {
    return this.hasCreditSettlement() && this.hasDebitSettlement();
  }
}

DepositAccountInterestOption.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id' // Explicit field name
  },

  // Foreign key - FIXED: Added field mapping
  DEPOSIT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account identifier',
    field: 'd_e_p_o_s_i_t__a_c_c_t__i_d' // Map to actual column name
  },

  // Credit settlement fields - FIXED: Added field mappings
  DR_SETLMNT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Debit settlement account identifier',
    field: 'd_r__s_e_t_l_m_n_t__a_c_c_t__i_d'
  },

  CR_SETLMNT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Credit settlement account identifier',
    field: 'c_r__s_e_t_l_m_n_t__a_c_c_t__i_d'
  },

  CR_SETLMNT_OPTION_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Credit settlement option code',
    field: 'c_r__s_e_t_l_m_n_t__o_p_t_i_o_n__c_d'
  },

  DR_SETLMNT_OPTION_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Debit settlement option code',
    field: 'd_r__s_e_t_l_m_n_t__o_p_t_i_o_n__c_d'
  },

  CR_SETLMNT_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Credit settlement account number',
    field: 'c_r__s_e_t_l_m_n_t__a_c_c_t__n_o'
  },

  DR_SETLMNT_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Debit settlement account number',
    field: 'd_r__s_e_t_l_m_n_t__a_c_c_t__n_o'
  },

  CR_SETLMNT_CUST_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Credit settlement customer name',
    field: 'c_r__s_e_t_l_m_n_t__c_u_s_t__n_m'
  },

  DR_SETLMNT_CUST_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Debit settlement customer name',
    field: 'd_r__s_e_t_l_m_n_t__c_u_s_t__n_m'
  },

  CR_SETLMNT_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Credit settlement BIC identifier',
    field: 'c_r__s_e_t_l_m_n_t__b_i_c__i_d'
  },

  DR_SETLMNT_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Debit settlement BIC identifier',
    field: 'd_r__s_e_t_l_m_n_t__b_i_c__i_d'
  },

  // Metadata fields - FIXED: Added field mappings
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user',
    field: 'c_r_e_a_t_e_d__b_y'
  },

  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Create date',
    field: 'c_r_e_a_t_e__d_t'
  },

  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    },
    comment: 'Record status',
    field: 'r_e_c__s_t'
  },

  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row timestamp',
    field: 'r_o_w__t_s'
  },

  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User identifier',
    field: 'u_s_e_r__i_d'
  },

  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number',
    field: 'v_e_r_s_i_o_n__n_o'
  },

  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp',
    field: 's_y_s__c_r_e_a_t_e__t_s'
  },

  // Charge settlement fields - FIXED: Added field mappings
  CHRG_SETLMNT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Charge settlement account identifier',
    field: 'c_h_r_g__s_e_t_l_m_n_t__a_c_c_t__i_d'
  },

  CHRG_SETLMNT_OPTN_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Charge settlement option code',
    field: 'c_h_r_g__s_e_t_l_m_n_t__o_p_t_n__c_d'
  },

  CHRG_SETLMNT_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Charge settlement account number',
    field: 'c_h_r_g__s_e_t_l_m_n_t__a_c_c_t__n_o'
  },

  CHRG_SETLMNT_CUST_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Charge settlement customer name',
    field: 'c_h_r_g__s_e_t_l_m_n_t__c_u_s_t__n_m'
  },

  CHRG_SETLMNT_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Charge settlement BIC identifier',
    field: 'c_h_r_g__s_e_t_l_m_n_t__b_i_c__i_d'
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  sequelize,
  modelName: 'DepositAccountInterestOption',
  tableName: 'deposit_account_interest_option',
  timestamps: true,
  underscored: false, // Disable automatic underscore transformation
  freezeTableName: true, // Prevent table name pluralization
  hooks: {
    beforeValidate: (option) => {
      // Ensure uppercase for status
      if (option.REC_ST) {
        option.REC_ST = option.REC_ST.toUpperCase();
      }
      
      // Trim string fields
      if (option.CR_SETLMNT_CUST_NM) option.CR_SETLMNT_CUST_NM = option.CR_SETLMNT_CUST_NM.trim();
      if (option.DR_SETLMNT_CUST_NM) option.DR_SETLMNT_CUST_NM = option.DR_SETLMNT_CUST_NM.trim();
      if (option.CHRG_SETLMNT_CUST_NM) option.CHRG_SETLMNT_CUST_NM = option.CHRG_SETLMNT_CUST_NM.trim();
      if (option.CR_SETLMNT_ACCT_NO) option.CR_SETLMNT_ACCT_NO = option.CR_SETLMNT_ACCT_NO.trim();
      if (option.DR_SETLMNT_ACCT_NO) option.DR_SETLMNT_ACCT_NO = option.DR_SETLMNT_ACCT_NO.trim();
      if (option.CHRG_SETLMNT_ACCT_NO) option.CHRG_SETLMNT_ACCT_NO = option.CHRG_SETLMNT_ACCT_NO.trim();
    },
    
    beforeCreate: async (option) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!option.CREATE_DT) option.CREATE_DT = now;
      if (!option.SYS_CREATE_TS) option.SYS_CREATE_TS = now;
      if (!option.ROW_TS) option.ROW_TS = now;
      
      // Validate settlement options
      const validation = await DepositAccountInterestOption.validateSettlementOptions(
        option.DEPOSIT_ACCT_ID,
        option
      );
      
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
    },
    
    beforeUpdate: (option) => {
      // Update row timestamp
      option.ROW_TS = new Date();
      
      // Increment version number on update
      if (option.changed() && !option.changed('VERSION_NO')) {
        option.VERSION_NO = (option.VERSION_NO || 0) + 1;
      }
    }
  },
  indexes: [
    // Primary index
    { 
      fields: ['id'],
      name: 'deposit_acct_int_opt_pk' // Shorter index name
    },
    
    // Foreign key indexes - FIXED: Shorter index names
    { 
      fields: ['DEPOSIT_ACCT_ID'],
      name: 'idx_dep_acct_id'
    },
    { 
      fields: ['CR_SETLMNT_ACCT_ID'],
      name: 'idx_cr_settle_acct'
    },
    { 
      fields: ['DR_SETLMNT_ACCT_ID'],
      name: 'idx_dr_settle_acct'
    },
    { 
      fields: ['CHRG_SETLMNT_ACCT_ID'],
      name: 'idx_chrg_settle_acct'
    },
    
    // Status and date indexes
    { 
      fields: ['REC_ST'],
      name: 'idx_rec_status'
    },
    { 
      fields: ['CREATE_DT'],
      name: 'idx_create_date'
    },
    { 
      fields: ['CREATED_BY'],
      name: 'idx_created_by'
    },
    { 
      fields: ['USER_ID'],
      name: 'idx_user_id'
    },
    
    // Composite indexes for common queries
    { 
      fields: ['DEPOSIT_ACCT_ID', 'REC_ST'],
      name: 'idx_acct_status'
    },
    { 
      fields: ['DEPOSIT_ACCT_ID', 'CREATE_DT'],
      name: 'idx_acct_create_date'
    },
    { 
      fields: ['CR_SETLMNT_OPTION_CD', 'DR_SETLMNT_OPTION_CD'],
      name: 'idx_settle_options'
    },
    { 
      fields: ['DEPOSIT_ACCT_ID', 'CR_SETLMNT_ACCT_ID', 'DR_SETLMNT_ACCT_ID'],
      name: 'idx_acct_settle_ids'
    },
    
    // Unique constraint to prevent duplicate active options
    {
      fields: [
        'DEPOSIT_ACCT_ID',
        'CR_SETLMNT_ACCT_ID', 
        'DR_SETLMNT_ACCT_ID',
        'CHRG_SETLMNT_ACCT_ID',
        'REC_ST'
      ],
      name: 'uniq_active_settle', // Shorter unique constraint name
      unique: true,
      where: { REC_ST: 'A' }
    }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'A' }
    },
    inactive: {
      where: { REC_ST: 'I' }
    },
    byDepositAccount: (depositAccountId) => ({
      where: { DEPOSIT_ACCT_ID: depositAccountId }
    }),
    byCreatedBy: (createdBy) => ({
      where: { CREATED_BY: createdBy }
    }),
    withCreditSettlement: {
      where: { CR_SETLMNT_OPTION_CD: { [Op.ne]: null } }
    },
    withDebitSettlement: {
      where: { DR_SETLMNT_OPTION_CD: { [Op.ne]: null } }
    },
    withChargeSettlement: {
      where: { CHRG_SETLMNT_OPTN_CD: { [Op.ne]: null } }
    },
    completeSetup: {
      where: {
        CR_SETLMNT_OPTION_CD: { [Op.ne]: null },
        DR_SETLMNT_OPTION_CD: { [Op.ne]: null }
      }
    },
    recent: {
      order: [['CREATE_DT', 'DESC']],
      limit: 50
    },
    dateRange: (startDate, endDate) => ({
      where: {
        CREATE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    })
  }
});

export default DepositAccountInterestOption;