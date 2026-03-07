// src/models/InwardFundsTransfer.js - FIXED mapWebhookData method
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
  // Virtual getters for nested objects
  get beneficiary() {
    return {
      name: this.BENEFICIARY_NM,
      account: this.BENEFICIARY_ACCT,
      bankName: this.BENEFICIARY_BANK_NM,
      bankCntryId: this.BENEFICIARY_BANK_CNTRY_ID,
      bicId: this.BENEFICIARY_BIC_ID
    };
  }

  get remitter() {
    return {
      name: this.REMITTER_NM,
      accountNo: this.REMITTER_ACCT_NO
    };
  }

  // Calculate net amount
  calculateNetAmount() {
    const xferAmount = parseFloat(this.XFER_AMT) || 0;
    const sendingCharges = parseFloat(this.SENDING_BANK_CHRG) || 0;
    const receivingCharges = parseFloat(this.RECIEVING_BANK_CHRG) || 0;
    
    return xferAmount - sendingCharges - receivingCharges;
  }

  // Get transfer summary
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
      isReversal: this.IS_REVERSAL
    };
  }

  static mapWebhookData(data) {
    // Log the incoming data for debugging
    console.log('🔵 [MAPPER] Mapping webhook data:', {
      xferRef: data.XFER_REF || data.xferRef,
      beneficiaryAccount: data.BENEFICIARY_ACCT || data.beneficiary?.account
    });

    // IMPORTANT: Do NOT include INWD_FUNDS_XFER_ID as it's auto-increment
    return {
      XFER_REF: data.XFER_REF || data.xferRef,
      XFER_AMT: data.XFER_AMT || data.xferAmt || 0,
      XFER_CRNCY_ID: data.XFER_CRNCY_ID || data.xferCrncyId || 1,
      PAY_CRNCY_ID: data.PAY_CRNCY_ID || data.payCrncyId || 1,
      PAY_EXCH_RATE: data.PAY_EXCH_RATE || data.payExchRate || 1,
      VALUE_DT: data.VALUE_DT || data.valueDt || new Date(),
      PRIORITY_LEVEL_CD: data.PRIORITY_LEVEL_CD || data.priorityLevelCd || 'NORMAL',
      BENEFICIARY_NM: data.BENEFICIARY_NM || data.beneficiary?.name,
      BENEFICIARY_ACCT: data.BENEFICIARY_ACCT || data.beneficiary?.account,
      BENEFICIARY_BIC_ID: data.BENEFICIARY_BIC_ID || data.beneficiary?.bicId || null, // Allow null
      BENEFICIARY_BANK_NM: data.BENEFICIARY_BANK_NM || data.beneficiary?.bankName,
      BENEFICIARY_BANK_CNTRY_ID: data.BENEFICIARY_BANK_CNTRY_ID || data.beneficiary?.bankCntryId || 1,
      REMITTER_NM: data.REMITTER_NM || data.remitter?.name,
      REMITTER_ACCT_NO: data.REMITTER_ACCT_NO || data.remitter?.accountNo,
      SENDING_BANK_CHRG: data.SENDING_BANK_CHRG || data.sendingBankChrg || 0,
      RECIEVING_BANK_CHRG: data.RECIEVING_BANK_CHRG || data.receivingBankChrg || 0,
      PAYMENT_MTD_CD: data.PAYMENT_MTD_CD || data.paymentMtdCd || 'GENERIC',
      REC_ST: 'P',
      CREATED_BY: data.CREATED_BY || 'WEBHOOK',
      USER_ID: data.USER_ID || 'WEBHOOK',
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      VERSION_NO: 1,
      REPAIR_FG: 'N',
      FOREIGN_IFT_FG: 'N',
      IS_REVERSAL: data.IS_REVERSAL || data.isReversal || false,
      ...(data.IS_REVERSAL && {
        ORIGINAL_XFER_REF: data.ORIGINAL_XFER_REF || data.originalXferRef
      })
    };
  }
}

InwardFundsTransfer.init({
  INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'i_n_w_d__f_u_n_d_s__x_f_e_r__i_d'
  },
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'x_f_e_r__r_e_f'
  },
  PAYMENT_MTD_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'p_a_y_m_e_n_t__m_t_d__c_d'
  },
  CHARGES_PAYER_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'c_h_a_r_g_e_s__p_a_y_e_r__c_d'
  },
  XFER_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'x_f_e_r__c_r_n_c_y__i_d'
  },
  XFER_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'x_f_e_r__a_m_t'
  },
  SENDING_BANK_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 's_e_n_d_i_n_g__b_a_n_k__c_h_r_g'
  },
  RECIEVING_BANK_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'r_e_c_i_e_v_i_n_g__b_a_n_k__c_h_r_g'
  },
  TOTAL_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 't_o_t_a_l__c_h_r_g'
  },
  NET_AMT_XFERED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'n_e_t__a_m_t__x_f_e_r_e_d'
  },
  PAY_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'p_a_y__c_r_n_c_y__i_d'
  },
  PAY_EXCH_RATE: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: false,
    defaultValue: 1.000000,
    field: 'p_a_y__e_x_c_h__r_a_t_e'
  },
  PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'p_a_y__a_m_t'
  },
  LCY_EQIVALENT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'l_c_y__e_q_i_v_a_l_e_n_t'
  },
  VALUE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'v_a_l_u_e__d_t'
  },
  PRIORITY_LEVEL_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'p_r_i_o_r_i_t_y__l_e_v_e_l__c_d'
  },
  SUPPLEMENTARY_REF: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 's_u_p_p_l_e_m_e_n_t_a_r_y__r_e_f'
  },
  XFER_PURPOSE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'x_f_e_r__p_u_r_p_o_s_e__i_d'
  },
  PAY_DETAILS: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    field: 'p_a_y__d_e_t_a_i_l_s'
  },
  FUNDS_XFER_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'f_u_n_d_s__x_f_e_r__t_y__i_d'
  },
  BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'b_u__i_d'
  },
  BENEFICIARY_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__n_m'
  },
  BENEFICIARY_ACCT: {
    type: DataTypes.STRING(60),
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_c_c_t'
  },
  BENEFICIARY_ADDR_LINE1: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e1'
  },
  BENEFICIARY_ADDR_LINE2: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e2'
  },
  BENEFICIARY_ADDR_LINE3: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e3'
  },
  BENEFICIARY_ADDR_LINE4: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e4'
  },
  BENEFICIARY_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__t_e_l__n_o'
  },
  BENEFICIARY_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,  // Allow NULL values
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_i_c__i_d',
    comment: 'Beneficiary BIC Identifier'
  },
  BENEFICIARY_BANK_NM: {
    type: DataTypes.STRING(60),
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__n_m'
  },
  BENEFICIARY_BRANCH: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_r_a_n_c_h'
  },
  BENEFICIARY_BANK_CITY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__c_i_t_y__i_d'
  },
  BENEFICIARY_BANK_STATE_COUNTY: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__s_t_a_t_e__c_o_u_n_t_y'
  },
  BENEFICIARY_BANK_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__c_n_t_r_y__i_d'
  },
  BENEFICIARY_BANK_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__t_e_l__n_o'
  },
  REMITTER_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'r_e_m_i_t_t_e_r__n_m'
  },
  REMITTER_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_c_c_t__n_o'
  },
  REMITTER_ADDR_LINE1: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e1'
  },
  REMITTER_ADDR_LINE2: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e2'
  },
  REMITTER_ADDR_LINE3: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e3'
  },
  REMITTER_ADDR_LINE4: {
    type: DataTypes.STRING(35),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e4'
  },
  REMITTER_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__t_e_l__n_o'
  },
  BENEFICIARY_IDENT_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__i_d_e_n_t__t_y__i_d'
  },
  REMITTER_IDENT_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__i_d_e_n_t__t_y__i_d'
  },
  REMITTER_IDENT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__i_d_e_n_t__n_o'
  },
  REMITTER_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_i_c__i_d'
  },
  REMITTER_BANK_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_a_n_k__n_m'
  },
  REMITTER_BRANCH_NM: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_r_a_n_c_h__n_m'
  },
  REMITTER_BANK_CITY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_a_n_k__c_i_t_y__i_d'
  },
  REMITTER_BANK_STATE_COUNTY: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_a_n_k__s_t_a_t_e__c_o_u_n_t_y'
  },
  REMITTER_BANK_TEL_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_a_n_k__t_e_l__n_o'
  },
  REMITTER_BANK_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__b_a_n_k__c_n_t_r_y__i_d'
  },
  SENDING_INSTITUTION_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 's_e_n_d_i_n_g__i_n_s_t_i_t_u_t_i_o_n__b_a_n_k__i_d'
  },
  ORDERING_INSTITUTION_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'o_r_d_e_r_i_n_g__i_n_s_t_i_t_u_t_i_o_n__b_a_n_k__i_d'
  },
  SENDER_CORRESPONDENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 's_e_n_d_e_r__c_o_r_r_e_s_p_o_n_d_e_n_t__b_a_n_k__i_d'
  },
  RECIEVER_CORRESPONDENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_c_i_e_v_e_r__c_o_r_r_e_s_p_o_n_d_e_n_t__b_a_n_k__i_d'
  },
  THIRD_REIMBURSEMENT_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 't_h_i_r_d__r_e_i_m_b_u_r_s_e_m_e_n_t__b_a_n_k__i_d'
  },
  INTERMEDIARY_BANK_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'i_n_t_e_r_m_e_d_i_a_r_y__b_a_n_k__i_d'
  },
  REC_ST: {
    type: DataTypes.ENUM(Object.values(RECORD_STATUS)),
    allowNull: false,
    defaultValue: RECORD_STATUS.PENDING,
    field: 'r_e_c__s_t'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'v_e_r_s_i_o_n__n_o'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'r_o_w__t_s'
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    field: 'u_s_e_r__i_d'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'c_r_e_a_t_e__d_t'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    field: 'c_r_e_a_t_e_d__b_y'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 's_y_s__c_r_e_a_t_e__t_s'
  },
  ADDTL_INSTRUCTION1: {
    type: DataTypes.STRING(256),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r_u_c_t_i_o_n1'
  },
  ADDTL_INSTRUCTION2: {
    type: DataTypes.STRING(256),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r_u_c_t_i_o_n2'
  },
  ADDTL_INSTRUCTION3: {
    type: DataTypes.STRING(256),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r_u_c_t_i_o_n3'
  },
  ADDTL_INSTRUCTION4: {
    type: DataTypes.STRING(256),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r_u_c_t_i_o_n4'
  },
  BENEFICIARY_SECRET_QA: {
    type: DataTypes.STRING(256),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__s_e_c_r_e_t__q_a'
  },
  SPEC_INSTRUCTION: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    field: 's_p_e_c__i_n_s_t_r_u_c_t_i_o_n'
  },
  REPAIR_FG: {
    type: DataTypes.ENUM(Object.values(REPAIR_FLAG)),
    allowNull: false,
    defaultValue: REPAIR_FLAG.NO,
    field: 'r_e_p_a_i_r__f_g'
  },
  FOREIGN_IFT_FG: {
    type: DataTypes.ENUM(Object.values(FOREIGN_IFT_FLAG)),
    allowNull: false,
    defaultValue: FOREIGN_IFT_FLAG.NO,
    field: 'f_o_r_e_i_g_n__i_f_t__f_g'
  },
  ADDTL_INSTR1_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r1__c_d'
  },
  ADDTL_INSTR2_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r2__c_d'
  },
  ADDTL_INSTR3_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r3__c_d'
  },
  ADDTL_INSTR4_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'a_d_d_t_l__i_n_s_t_r4__c_d'
  },
  NIP_SESSION_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'n_i_p__s_e_s_s_i_o_n__i_d'
  },
  NIP_RESPONSE_CODE: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'n_i_p__r_e_s_p_o_n_s_e__c_o_d_e'
  },
  SETTLEMENT_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 's_e_t_t_l_e_m_e_n_t__d_a_t_e'
  },
  NIP_CHANNEL_CODE: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'n_i_p__c_h_a_n_n_e_l__c_o_d_e'
  },
  NIP_DESTINATION_INSTITUTION: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'n_i_p__d_e_s_t_i_n_a_t_i_o_n__i_n_s_t_i_t_u_t_i_o_n'
  },
  NIP_TRANSACTION_FEE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'n_i_p__t_r_a_n_s_a_c_t_i_o_n__f_e_e'
  },
  NIP_TRANSACTION_LOCATION: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'n_i_p__t_r_a_n_s_a_c_t_i_o_n__l_o_c_a_t_i_o_n'
  },
  BENEFICIARY_BVN: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_v_n'
  },
  ORIGINATOR_BVN: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'o_r_i_g_i_n_a_t_o_r__b_v_n'
  },
  IS_REVERSAL: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'i_s__r_e_v_e_r_s_a_l'
  },
  ORIGINAL_XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'o_r_i_g_i_n_a_l__x_f_e_r__r_e_f'
  },
  REVERSAL_REASON: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'r_e_v_e_r_s_a_l__r_e_a_s_o_n'
  },
  REVERSAL_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'r_e_v_e_r_s_a_l__d_a_t_e'
  },
  REVERSED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true,
    field: 'r_e_v_e_r_s_e_d__b_y'
  },
  BATCH_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'b_a_t_c_h__i_d'
  }
}, {
  sequelize,
  modelName: 'InwardFundsTransfer',
  tableName: 'INWARD_FUNDS_TRANSFERS',
  timestamps: false,
  hooks: {
    beforeCreate: (transfer) => {
      // Calculate net amount if not provided
      if (!transfer.NET_AMT_XFERED) {
        const xferAmt = parseFloat(transfer.XFER_AMT) || 0;
        const sendingChrg = parseFloat(transfer.SENDING_BANK_CHRG) || 0;
        const receivingChrg = parseFloat(transfer.RECIEVING_BANK_CHRG) || 0;
        transfer.NET_AMT_XFERED = xferAmt - sendingChrg - receivingChrg;
      }
      
      // Set timestamps
      if (!transfer.ROW_TS) transfer.ROW_TS = new Date();
      if (!transfer.CREATE_DT) transfer.CREATE_DT = new Date();
      if (!transfer.SYS_CREATE_TS) transfer.SYS_CREATE_TS = new Date();
    }
  }
});

export default InwardFundsTransfer;