// src/models/InwardFundsTransfer.js - COMPLETE FIXED VERSION
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
      name: this.beneficiary_nm,
      account: this.beneficiary_acct,
      bankName: this.beneficiary_bank_nm,
      bankCntryId: this.beneficiary_bank_cntry_id,
      bicId: this.beneficiary_bic_id
    };
  }

  get remitter() {
    return {
      name: this.remitter_nm,
      accountNo: this.remitter_acct_no
    };
  }

  // Calculate net amount
  calculateNetAmount() {
    const xferAmount = parseFloat(this.xfer_amt) || 0;
    const sendingCharges = parseFloat(this.sending_bank_chrg) || 0;
    const receivingCharges = parseFloat(this.recieving_bank_chrg) || 0;
    return xferAmount - sendingCharges - receivingCharges;
  }

  // Get transfer summary
  getSummary() {
    return {
      transferId: this.id,
      reference: this.xfer_ref,
      amount: parseFloat(this.xfer_amt) || 0,
      currencyId: this.xfer_crncy_id,
      beneficiaryName: this.beneficiary_nm,
      beneficiaryAccount: this.beneficiary_acct,
      remitterName: this.remitter_nm,
      valueDate: this.value_dt,
      status: this.rec_st,
      netAmount: this.calculateNetAmount(),
      isReversal: this.is_reversal
    };
  }

  static mapWebhookData(data) {
    // Log the incoming data for debugging
    console.log('🔵 [MAPPER] Mapping webhook data:', {
      xferRef: data.xfer_ref || data.xferRef,
      beneficiaryAccount: data.beneficiary_acct || data.beneficiary?.account
    });

    return {
      xfer_ref: data.xfer_ref || data.xferRef,
      xfer_amt: data.xfer_amt || data.xferAmt || 0,
      xfer_crncy_id: data.xfer_crncy_id || data.xferCrncyId || 1,
      pay_crncy_id: data.pay_crncy_id || data.payCrncyId || 1,
      pay_exch_rate: data.pay_exch_rate || data.payExchRate || 1,
      value_dt: data.value_dt || data.valueDt || new Date(),
      priority_level_cd: data.priority_level_cd || data.priorityLevelCd || 'NORMAL',
      beneficiary_nm: data.beneficiary_nm || data.beneficiary?.name,
      beneficiary_acct: data.beneficiary_acct || data.beneficiary?.account,
      beneficiary_bic_id: data.beneficiary_bic_id || data.beneficiary?.bicId || null,
      beneficiary_bank_nm: data.beneficiary_bank_nm || data.beneficiary?.bankName,
      beneficiary_bank_cntry_id: data.beneficiary_bank_cntry_id || data.beneficiary?.bankCntryId || 1,
      remitter_nm: data.remitter_nm || data.remitter?.name,
      remitter_acct_no: data.remitter_acct_no || data.remitter?.accountNo,
      sending_bank_chrg: data.sending_bank_chrg || data.sendingBankChrg || 0,
      recieving_bank_chrg: data.recieving_bank_chrg || data.receivingBankChrg || 0,
      payment_mtd_cd: data.payment_mtd_cd || data.paymentMtdCd || 'GENERIC',
      rec_st: 'P',
      created_by: data.created_by || 'WEBHOOK',
      user_id: data.user_id || 'WEBHOOK',
      is_reversal: data.is_reversal || data.isReversal || false,
      ...(data.is_reversal && {
        original_xfer_ref: data.original_xfer_ref || data.originalXferRef
      })
    };
  }
}

InwardFundsTransfer.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'id'
  },
  transaction_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'transaction_id'
  },
  direction: {
    type: DataTypes.ENUM('INWARD', 'OUTWARD'),
    allowNull: false,
    field: 'direction'
  },
  amount: {
    type: DataTypes.DECIMAL(18, 2),
    allowNull: false,
    field: 'amount'
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: 'NGN',
    field: 'currency'
  },
  sender_account: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'sender_account'
  },
  receiver_account: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'receiver_account'
  },
  sender_bank: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'sender_bank'
  },
  receiver_bank: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'receiver_bank'
  },
  narration: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'narration'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'),
    allowNull: true,
    defaultValue: 'PENDING',
    field: 'status'
  },
  processing_time: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'processing_time'
  },
  reference: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'reference'
  },
  session_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'session_id'
  },
  response_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'response_code'
  },
  response_message: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'response_message'
  },
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
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  }
}, {
  sequelize,
  modelName: 'InwardFundsTransfer',
  tableName: 'inward_funds_transfers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  hooks: {
    beforeCreate: (transfer) => {
      if (!transfer.created_at) transfer.created_at = new Date();
      if (!transfer.updated_at) transfer.updated_at = new Date();
    },
    beforeUpdate: (transfer) => {
      transfer.updated_at = new Date();
      // If status changed to COMPLETED, set completed_at
      if (transfer.changed('status') && transfer.status === 'COMPLETED') {
        transfer.completed_at = new Date();
      }
    }
  }
});

export default InwardFundsTransfer;