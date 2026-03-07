// src/models/OutwardFundsTransfer.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const RECORD_STATUS = {
  ACTIVE: 'A',
  INACTIVE: 'I',
  PENDING: 'P',
  PROCESSING: 'PR',
  COMPLETED: 'C',
  FAILED: 'F',
  REVERSED: 'R'
};

export const REPAIR_FLAG = {
  YES: 'Y',
  NO: 'N'
};

export const FOREIGN_OFT_FLAG = {
  YES: 'Y',
  NO: 'N'
};

export const TRANSACTION_STATUS = {
  INITIATED: 'INITIATED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REVERSED: 'REVERSED'
};

class OutwardFundsTransfer extends Model {
  // Virtual getters for nested objects
  get beneficiary() {
    return {
      name: this.BENEFICIARY_NM,
      account: this.BENEFICIARY_ACCT,
      bankName: this.BENEFICIARY_BANK_NM,
      bankCode: this.BENEFICIARY_BANK_CODE,
      bankCntryId: this.BENEFICIARY_BANK_CNTRY_ID,
      bicId: this.BENEFICIARY_BIC_ID,
      email: this.BENEFICIARY_EMAIL,
      phone: this.BENEFICIARY_PHONE
    };
  }

  get remitter() {
    return {
      name: this.REMITTER_NM,
      accountNo: this.REMITTER_ACCT_NO,
      customerId: this.REMITTER_CUSTOMER_ID,
      email: this.REMITTER_EMAIL,
      phone: this.REMITTER_PHONE
    };
  }

  get charges() {
    return {
      sendingBank: parseFloat(this.SENDING_BANK_CHRG) || 0,
      receivingBank: parseFloat(this.RECIEVING_BANK_CHRG) || 0,
      nip: parseFloat(this.NIP_TRANSACTION_FEE) || 0,
      vat: parseFloat(this.VAT_AMOUNT) || 0,
      total: parseFloat(this.TOTAL_CHRG) || 0
    };
  }

  // Calculate net amount (amount after all charges)
  calculateNetAmount() {
    const xferAmount = parseFloat(this.XFER_AMT) || 0;
    const sendingCharges = parseFloat(this.SENDING_BANK_CHRG) || 0;
    const receivingCharges = parseFloat(this.RECIEVING_BANK_CHRG) || 0;
    const nipFee = parseFloat(this.NIP_TRANSACTION_FEE) || 0;
    const vat = parseFloat(this.VAT_AMOUNT) || 0;
    
    return xferAmount - sendingCharges - receivingCharges - nipFee - vat;
  }

  // Calculate total debit amount (amount + all charges)
  calculateTotalDebit() {
    const xferAmount = parseFloat(this.XFER_AMT) || 0;
    const sendingCharges = parseFloat(this.SENDING_BANK_CHRG) || 0;
    const nipFee = parseFloat(this.NIP_TRANSACTION_FEE) || 0;
    const vat = parseFloat(this.VAT_AMOUNT) || 0;
    
    return xferAmount + sendingCharges + nipFee + vat;
  }

  // Get transfer summary
  getSummary() {
    return {
      transferId: this.OUTWD_FUNDS_XFER_ID,
      reference: this.XFER_REF,
      amount: parseFloat(this.XFER_AMT) || 0,
      currencyId: this.XFER_CRNCY_ID,
      beneficiaryName: this.BENEFICIARY_NM,
      beneficiaryAccount: this.BENEFICIARY_ACCT,
      beneficiaryBank: this.BENEFICIARY_BANK_NM,
      remitterName: this.REMITTER_NM,
      remitterAccount: this.REMITTER_ACCT_NO,
      valueDate: this.VALUE_DT,
      status: this.TRANSACTION_STATUS || this.REC_ST,
      netAmount: this.calculateNetAmount(),
      totalDebit: this.calculateTotalDebit(),
      isReversal: this.IS_REVERSAL,
      processingDate: this.PROCESSING_DATE,
      completedDate: this.COMPLETED_DATE
    };
  }

  static mapWebhookData(data) {
    // Log the incoming data for debugging
    console.log('🔵 [OUTWARD MAPPER] Mapping webhook data:', {
      xferRef: data.XFER_REF || data.xferRef,
      beneficiaryAccount: data.BENEFICIARY_ACCT || data.beneficiary?.account,
      amount: data.XFER_AMT || data.xferAmt
    });

    // IMPORTANT: Do NOT include OUTWD_FUNDS_XFER_ID as it's auto-increment
    return {
      XFER_REF: data.XFER_REF || data.xferRef,
      XFER_AMT: data.XFER_AMT || data.xferAmt || 0,
      XFER_CRNCY_ID: data.XFER_CRNCY_ID || data.xferCrncyId || 1,
      PAY_CRNCY_ID: data.PAY_CRNCY_ID || data.payCrncyId || 1,
      PAY_EXCH_RATE: data.PAY_EXCH_RATE || data.payExchRate || 1,
      VALUE_DT: data.VALUE_DT || data.valueDt || new Date(),
      PROCESSING_DATE: data.PROCESSING_DATE || data.processingDate || null,
      COMPLETED_DATE: data.COMPLETED_DATE || data.completedDate || null,
      PRIORITY_LEVEL_CD: data.PRIORITY_LEVEL_CD || data.priorityLevelCd || 'NORMAL',
      
      // Beneficiary details
      BENEFICIARY_NM: data.BENEFICIARY_NM || data.beneficiary?.name,
      BENEFICIARY_ACCT: data.BENEFICIARY_ACCT || data.beneficiary?.account,
      BENEFICIARY_BIC_ID: data.BENEFICIARY_BIC_ID || data.beneficiary?.bicId || null,
      BENEFICIARY_BANK_NM: data.BENEFICIARY_BANK_NM || data.beneficiary?.bankName,
      BENEFICIARY_BANK_CODE: data.BENEFICIARY_BANK_CODE || data.beneficiary?.bankCode,
      BENEFICIARY_BANK_CNTRY_ID: data.BENEFICIARY_BANK_CNTRY_ID || data.beneficiary?.bankCntryId || 1,
      BENEFICIARY_EMAIL: data.BENEFICIARY_EMAIL || data.beneficiary?.email,
      BENEFICIARY_PHONE: data.BENEFICIARY_PHONE || data.beneficiary?.phone,
      BENEFICIARY_ADDR_LINE1: data.BENEFICIARY_ADDR_LINE1 || data.beneficiary?.addressLine1,
      BENEFICIARY_ADDR_LINE2: data.BENEFICIARY_ADDR_LINE2 || data.beneficiary?.addressLine2,
      BENEFICIARY_CITY: data.BENEFICIARY_CITY || data.beneficiary?.city,
      BENEFICIARY_STATE: data.BENEFICIARY_STATE || data.beneficiary?.state,
      BENEFICIARY_POSTAL_CODE: data.BENEFICIARY_POSTAL_CODE || data.beneficiary?.postalCode,
      BENEFICIARY_COUNTRY_ID: data.BENEFICIARY_COUNTRY_ID || data.beneficiary?.countryId || 1,
      BENEFICIARY_BVN: data.BENEFICIARY_BVN || data.beneficiary?.bvn,
      
      // Remitter details
      REMITTER_NM: data.REMITTER_NM || data.remitter?.name,
      REMITTER_ACCT_NO: data.REMITTER_ACCT_NO || data.remitter?.accountNo,
      REMITTER_CUSTOMER_ID: data.REMITTER_CUSTOMER_ID || data.remitter?.customerId,
      REMITTER_EMAIL: data.REMITTER_EMAIL || data.remitter?.email,
      REMITTER_PHONE: data.REMITTER_PHONE || data.remitter?.phone,
      REMITTER_ADDR_LINE1: data.REMITTER_ADDR_LINE1 || data.remitter?.addressLine1,
      REMITTER_ADDR_LINE2: data.REMITTER_ADDR_LINE2 || data.remitter?.addressLine2,
      REMITTER_CITY: data.REMITTER_CITY || data.remitter?.city,
      REMITTER_STATE: data.REMITTER_STATE || data.remitter?.state,
      REMITTER_POSTAL_CODE: data.REMITTER_POSTAL_CODE || data.remitter?.postalCode,
      REMITTER_COUNTRY_ID: data.REMITTER_COUNTRY_ID || data.remitter?.countryId || 1,
      REMITTER_IDENT_TY_ID: data.REMITTER_IDENT_TY_ID || data.remitter?.idType,
      REMITTER_IDENT_NO: data.REMITTER_IDENT_NO || data.remitter?.idNumber,
      
      // Charges
      SENDING_BANK_CHRG: data.SENDING_BANK_CHRG || data.sendingBankChrg || 0,
      RECIEVING_BANK_CHRG: data.RECIEVING_BANK_CHRG || data.receivingBankChrg || 0,
      NIP_TRANSACTION_FEE: data.NIP_TRANSACTION_FEE || data.nipFee || 0,
      VAT_AMOUNT: data.VAT_AMOUNT || data.vatAmount || 0,
      TOTAL_CHRG: data.TOTAL_CHRG || data.totalCharges || 0,
      
      // Payment details
      PAYMENT_MTD_CD: data.PAYMENT_MTD_CD || data.paymentMtdCd || 'GENERIC',
      PAY_DETAILS: data.PAY_DETAILS || data.payDetails,
      XFER_PURPOSE_ID: data.XFER_PURPOSE_ID || data.xferPurposeId,
      SUPPLEMENTARY_REF: data.SUPPLEMENTARY_REF || data.supplementaryRef,
      
      // NIP Specific fields
      NIP_SESSION_ID: data.NIP_SESSION_ID || data.nipSessionId,
      NIP_RESPONSE_CODE: data.NIP_RESPONSE_CODE || data.nipResponseCode,
      NIP_CHANNEL_CODE: data.NIP_CHANNEL_CODE || data.nipChannelCode || 'API',
      NIP_DESTINATION_INSTITUTION: data.NIP_DESTINATION_INSTITUTION || data.nipDestinationInstitution,
      NIP_TRANSACTION_LOCATION: data.NIP_TRANSACTION_LOCATION || data.nipTransactionLocation,
      
      // Status fields
      REC_ST: data.REC_ST || RECORD_STATUS.PENDING,
      TRANSACTION_STATUS: data.TRANSACTION_STATUS || TRANSACTION_STATUS.INITIATED,
      REPAIR_FG: data.REPAIR_FG || REPAIR_FLAG.NO,
      FOREIGN_OFT_FG: data.FOREIGN_OFT_FG || FOREIGN_OFT_FLAG.NO,
      
      // Audit fields
      CREATED_BY: data.CREATED_BY || 'API',
      USER_ID: data.USER_ID || 'API',
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      VERSION_NO: 1,
      
      // Reversal fields
      IS_REVERSAL: data.IS_REVERSAL || data.isReversal || false,
      ...(data.IS_REVERSAL && {
        ORIGINAL_XFER_REF: data.ORIGINAL_XFER_REF || data.originalXferRef,
        REVERSAL_REASON: data.REVERSAL_REASON || data.reversalReason,
        REVERSAL_DATE: data.REVERSAL_DATE || data.reversalDate || new Date(),
        REVERSED_BY: data.REVERSED_BY || data.reversedBy || 'SYSTEM'
      }),
      
      // Batch processing
      BATCH_ID: data.BATCH_ID || data.batchId,
      
      // Additional instructions
      ADDTL_INSTRUCTION1: data.ADDTL_INSTRUCTION1 || data.addtlInstruction1,
      ADDTL_INSTRUCTION2: data.ADDTL_INSTRUCTION2 || data.addtlInstruction2,
      ADDTL_INSTRUCTION3: data.ADDTL_INSTRUCTION3 || data.addtlInstruction3,
      ADDTL_INSTRUCTION4: data.ADDTL_INSTRUCTION4 || data.addtlInstruction4,
      SPEC_INSTRUCTION: data.SPEC_INSTRUCTION || data.specInstruction
    };
  }
}

OutwardFundsTransfer.init({
  OUTWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'o_u_t_w_d__f_u_n_d_s__x_f_e_r__i_d'
  },
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
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
    defaultValue: 0.00,
    field: 's_e_n_d_i_n_g__b_a_n_k__c_h_r_g'
  },
  RECIEVING_BANK_CHRG: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'r_e_c_i_e_v_i_n_g__b_a_n_k__c_h_r_g'
  },
  NIP_TRANSACTION_FEE: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'n_i_p__t_r_a_n_s_a_c_t_i_o_n__f_e_e'
  },
  VAT_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'v_a_t__a_m_o_u_n_t'
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
  VALUE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'v_a_l_u_e__d_t'
  },
  PROCESSING_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'p_r_o_c_e_s_s_i_n_g__d_a_t_e'
  },
  COMPLETED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'c_o_m_p_l_e_t_e_d__d_a_t_e'
  },
  PRIORITY_LEVEL_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'NORMAL',
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
  
  // Beneficiary fields
  BENEFICIARY_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__n_m'
  },
  BENEFICIARY_ACCT: {
    type: DataTypes.STRING(60),
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_c_c_t'
  },
  BENEFICIARY_BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_i_c__i_d'
  },
  BENEFICIARY_BANK_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__n_m'
  },
  BENEFICIARY_BANK_CODE: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__c_o_d_e'
  },
  BENEFICIARY_BANK_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_a_n_k__c_n_t_r_y__i_d'
  },
  BENEFICIARY_EMAIL: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__e_m_a_i_l'
  },
  BENEFICIARY_PHONE: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__p_h_o_n_e'
  },
  BENEFICIARY_ADDR_LINE1: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e1'
  },
  BENEFICIARY_ADDR_LINE2: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__a_d_d_r__l_i_n_e2'
  },
  BENEFICIARY_CITY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__c_i_t_y'
  },
  BENEFICIARY_STATE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__s_t_a_t_e'
  },
  BENEFICIARY_POSTAL_CODE: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__p_o_s_t_a_l__c_o_d_e'
  },
  BENEFICIARY_COUNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    field: 'b_e_n_e_f_i_c_i_a_r_y__c_o_u_n_t_r_y__i_d'
  },
  BENEFICIARY_BVN: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'b_e_n_e_f_i_c_i_a_r_y__b_v_n'
  },
  
  // Remitter fields
  REMITTER_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'r_e_m_i_t_t_e_r__n_m'
  },
  REMITTER_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: false,
    field: 'r_e_m_i_t_t_e_r__a_c_c_t__n_o'
  },
  REMITTER_CUSTOMER_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__c_u_s_t_o_m_e_r__i_d'
  },
  REMITTER_EMAIL: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__e_m_a_i_l'
  },
  REMITTER_PHONE: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__p_h_o_n_e'
  },
  REMITTER_ADDR_LINE1: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e1'
  },
  REMITTER_ADDR_LINE2: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__a_d_d_r__l_i_n_e2'
  },
  REMITTER_CITY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__c_i_t_y'
  },
  REMITTER_STATE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__s_t_a_t_e'
  },
  REMITTER_POSTAL_CODE: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'r_e_m_i_t_t_e_r__p_o_s_t_a_l__c_o_d_e'
  },
  REMITTER_COUNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    field: 'r_e_m_i_t_t_e_r__c_o_u_n_t_r_y__i_d'
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
  
  // NIP Specific fields
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
  NIP_TRANSACTION_LOCATION: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'n_i_p__t_r_a_n_s_a_c_t_i_o_n__l_o_c_a_t_i_o_n'
  },
  
  // Status fields
  REC_ST: {
    type: DataTypes.ENUM(Object.values(RECORD_STATUS)),
    allowNull: false,
    defaultValue: RECORD_STATUS.PENDING,
    field: 'r_e_c__s_t'
  },
  TRANSACTION_STATUS: {
    type: DataTypes.ENUM(Object.values(TRANSACTION_STATUS)),
    allowNull: false,
    defaultValue: TRANSACTION_STATUS.INITIATED,
    field: 't_r_a_n_s_a_c_t_i_o_n__s_t_a_t_u_s'
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
  
  // Flag fields
  REPAIR_FG: {
    type: DataTypes.ENUM(Object.values(REPAIR_FLAG)),
    allowNull: false,
    defaultValue: REPAIR_FLAG.NO,
    field: 'r_e_p_a_i_r__f_g'
  },
  FOREIGN_OFT_FG: {
    type: DataTypes.ENUM(Object.values(FOREIGN_OFT_FLAG)),
    allowNull: false,
    defaultValue: FOREIGN_OFT_FLAG.NO,
    field: 'f_o_r_e_i_g_n__o_f_t__f_g'
  },
  
  // Additional instructions
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
  SPEC_INSTRUCTION: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    field: 's_p_e_c__i_n_s_t_r_u_c_t_i_o_n'
  },
  
  // Reversal fields
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
  
  // Batch processing
  BATCH_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'b_a_t_c_h__i_d'
  },
  
  // Settlement
  SETTLEMENT_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 's_e_t_t_l_e_m_e_n_t__d_a_t_e'
  }
}, {
  sequelize,
  modelName: 'OutwardFundsTransfer',
  tableName: 'OUTWARD_FUNDS_TRANSFERS',
  timestamps: false,
  hooks: {
    beforeCreate: (transfer) => {
      // Calculate net amount if not provided
      if (!transfer.NET_AMT_XFERED) {
        transfer.NET_AMT_XFERED = transfer.calculateNetAmount();
      }
      
      // Calculate total charges if not provided
      if (!transfer.TOTAL_CHRG) {
        const sendingChrg = parseFloat(transfer.SENDING_BANK_CHRG) || 0;
        const receivingChrg = parseFloat(transfer.RECIEVING_BANK_CHRG) || 0;
        const nipFee = parseFloat(transfer.NIP_TRANSACTION_FEE) || 0;
        const vat = parseFloat(transfer.VAT_AMOUNT) || 0;
        transfer.TOTAL_CHRG = sendingChrg + receivingChrg + nipFee + vat;
      }
      
      // Set timestamps
      if (!transfer.ROW_TS) transfer.ROW_TS = new Date();
      if (!transfer.CREATE_DT) transfer.CREATE_DT = new Date();
      if (!transfer.SYS_CREATE_TS) transfer.SYS_CREATE_TS = new Date();
    },
    
    beforeUpdate: (transfer) => {
      // Update processing dates based on status
      if (transfer.TRANSACTION_STATUS === TRANSACTION_STATUS.PROCESSING && !transfer.PROCESSING_DATE) {
        transfer.PROCESSING_DATE = new Date();
      }
      
      if (transfer.TRANSACTION_STATUS === TRANSACTION_STATUS.COMPLETED && !transfer.COMPLETED_DATE) {
        transfer.COMPLETED_DATE = new Date();
      }
    }
  }
});

export default OutwardFundsTransfer;