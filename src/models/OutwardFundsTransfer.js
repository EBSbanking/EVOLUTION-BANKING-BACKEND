// src/models/OutwardFundsTransfer.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

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
  get beneficiary() {
    return {
      name: this.beneficiaryNm,
      account: this.beneficiaryAcct,
      bankName: this.beneficiaryBankNm,
      bankCode: this.beneficiaryBankCode,
      bankCntryId: this.beneficiaryBankCntryId,
      bicId: this.beneficiaryBicId,
      email: this.beneficiaryEmail,
      phone: this.beneficiaryPhone
    };
  }

  get remitter() {
    return {
      name: this.remitterNm,
      accountNo: this.remitterAcctNo,
      customerId: this.remitterCustomerId,
      email: this.remitterEmail,
      phone: this.remitterPhone
    };
  }

  get charges() {
    return {
      sendingBank: parseFloat(this.sendingBankChrg) || 0,
      receivingBank: parseFloat(this.receivingBankChrg) || 0,   // fixed spelling
      nip: parseFloat(this.nipTransactionFee) || 0,
      vat: parseFloat(this.vatAmount) || 0,
      total: parseFloat(this.totalChrg) || 0
    };
  }

  calculateNetAmount() {
    const xferAmount = parseFloat(this.xferAmt) || 0;
    const sendingCharges = parseFloat(this.sendingBankChrg) || 0;
    const receivingCharges = parseFloat(this.receivingBankChrg) || 0;   // fixed
    const nipFee = parseFloat(this.nipTransactionFee) || 0;
    const vat = parseFloat(this.vatAmount) || 0;
    return xferAmount - sendingCharges - receivingCharges - nipFee - vat;
  }

  calculateTotalDebit() {
    const xferAmount = parseFloat(this.xferAmt) || 0;
    const sendingCharges = parseFloat(this.sendingBankChrg) || 0;
    const nipFee = parseFloat(this.nipTransactionFee) || 0;
    const vat = parseFloat(this.vatAmount) || 0;
    return xferAmount + sendingCharges + nipFee + vat;
  }

  getSummary() {
    return {
      transferId: this.id,
      reference: this.xferRef,
      amount: parseFloat(this.xferAmt) || 0,
      currencyId: this.xferCrncyId,
      beneficiaryName: this.beneficiaryNm,
      beneficiaryAccount: this.beneficiaryAcct,
      beneficiaryBank: this.beneficiaryBankNm,
      remitterName: this.remitterNm,
      remitterAccount: this.remitterAcctNo,
      valueDate: this.valueDt,
      status: this.transactionStatus || this.recSt,
      netAmount: this.calculateNetAmount(),
      totalDebit: this.calculateTotalDebit(),
      isReversal: this.isReversal,
      processingDate: this.processingDate,
      completedDate: this.completedDate
    };
  }

  static mapWebhookData(data) {
    return {
      xferRef: data.xferRef || data.XFER_REF,
      xferAmt: data.xferAmt || data.XFER_AMT || 0,
      xferCrncyId: data.xferCrncyId || data.XFER_CRNCY_ID || 1,
      payCrncyId: data.payCrncyId || data.PAY_CRNCY_ID || 1,
      payExchRate: data.payExchRate || data.PAY_EXCH_RATE || 1,
      valueDt: data.valueDt || data.VALUE_DT || new Date(),
      processingDate: data.processingDate || data.PROCESSING_DATE || null,
      completedDate: data.completedDate || data.COMPLETED_DATE || null,
      priorityLevelCd: data.priorityLevelCd || data.PRIORITY_LEVEL_CD || 'NORMAL',
      
      beneficiaryNm: data.beneficiaryNm || data.BENEFICIARY_NM || data.beneficiary?.name,
      beneficiaryAcct: data.beneficiaryAcct || data.BENEFICIARY_ACCT || data.beneficiary?.account,
      beneficiaryBicId: data.beneficiaryBicId || data.BENEFICIARY_BIC_ID || data.beneficiary?.bicId,
      beneficiaryBankNm: data.beneficiaryBankNm || data.BENEFICIARY_BANK_NM || data.beneficiary?.bankName,
      beneficiaryBankCode: data.beneficiaryBankCode || data.BENEFICIARY_BANK_CODE || data.beneficiary?.bankCode,
      beneficiaryBankCntryId: data.beneficiaryBankCntryId || data.BENEFICIARY_BANK_CNTRY_ID || data.beneficiary?.bankCntryId || 1,
      beneficiaryEmail: data.beneficiaryEmail || data.BENEFICIARY_EMAIL || data.beneficiary?.email,
      beneficiaryPhone: data.beneficiaryPhone || data.BENEFICIARY_PHONE || data.beneficiary?.phone,
      beneficiaryAddrLine1: data.beneficiaryAddrLine1 || data.BENEFICIARY_ADDR_LINE1 || data.beneficiary?.addressLine1,
      beneficiaryAddrLine2: data.beneficiaryAddrLine2 || data.BENEFICIARY_ADDR_LINE2 || data.beneficiary?.addressLine2,
      beneficiaryCity: data.beneficiaryCity || data.BENEFICIARY_CITY || data.beneficiary?.city,
      beneficiaryState: data.beneficiaryState || data.BENEFICIARY_STATE || data.beneficiary?.state,
      beneficiaryPostalCode: data.beneficiaryPostalCode || data.BENEFICIARY_POSTAL_CODE || data.beneficiary?.postalCode,
      beneficiaryCountryId: data.beneficiaryCountryId || data.BENEFICIARY_COUNTRY_ID || data.beneficiary?.countryId || 1,
      beneficiaryBvn: data.beneficiaryBvn || data.BENEFICIARY_BVN || data.beneficiary?.bvn,
      
      remitterNm: data.remitterNm || data.REMITTER_NM || data.remitter?.name,
      remitterAcctNo: data.remitterAcctNo || data.REMITTER_ACCT_NO || data.remitter?.accountNo,
      remitterCustomerId: data.remitterCustomerId || data.REMITTER_CUSTOMER_ID || data.remitter?.customerId,
      remitterEmail: data.remitterEmail || data.REMITTER_EMAIL || data.remitter?.email,
      remitterPhone: data.remitterPhone || data.REMITTER_PHONE || data.remitter?.phone,
      remitterAddrLine1: data.remitterAddrLine1 || data.REMITTER_ADDR_LINE1 || data.remitter?.addressLine1,
      remitterAddrLine2: data.remitterAddrLine2 || data.REMITTER_ADDR_LINE2 || data.remitter?.addressLine2,
      remitterCity: data.remitterCity || data.REMITTER_CITY || data.remitter?.city,
      remitterState: data.remitterState || data.REMITTER_STATE || data.remitter?.state,
      remitterPostalCode: data.remitterPostalCode || data.REMITTER_POSTAL_CODE || data.remitter?.postalCode,
      remitterCountryId: data.remitterCountryId || data.REMITTER_COUNTRY_ID || data.remitter?.countryId || 1,
      remitterIdentTyId: data.remitterIdentTyId || data.REMITTER_IDENT_TY_ID || data.remitter?.idType,
      remitterIdentNo: data.remitterIdentNo || data.REMITTER_IDENT_NO || data.remitter?.idNumber,
      
      sendingBankChrg: data.sendingBankChrg || data.SENDING_BANK_CHRG || 0,
      receivingBankChrg: data.receivingBankChrg || data.RECEIVING_BANK_CHRG || 0,
      nipTransactionFee: data.nipTransactionFee || data.NIP_TRANSACTION_FEE || 0,
      vatAmount: data.vatAmount || data.VAT_AMOUNT || 0,
      totalChrg: data.totalChrg || data.TOTAL_CHRG || 0,
      
      paymentMtdCd: data.paymentMtdCd || data.PAYMENT_MTD_CD || 'GENERIC',
      payDetails: data.payDetails || data.PAY_DETAILS,
      xferPurposeId: data.xferPurposeId || data.XFER_PURPOSE_ID,
      supplementaryRef: data.supplementaryRef || data.SUPPLEMENTARY_REF,
      
      nipSessionId: data.nipSessionId || data.NIP_SESSION_ID,
      nipResponseCode: data.nipResponseCode || data.NIP_RESPONSE_CODE,
      nipChannelCode: data.nipChannelCode || data.NIP_CHANNEL_CODE || 'API',
      nipDestinationInstitution: data.nipDestinationInstitution || data.NIP_DESTINATION_INSTITUTION,
      nipTransactionLocation: data.nipTransactionLocation || data.NIP_TRANSACTION_LOCATION,
      
      recSt: data.recSt || RECORD_STATUS.PENDING,
      transactionStatus: data.transactionStatus || TRANSACTION_STATUS.INITIATED,
      repairFg: data.repairFg || REPAIR_FLAG.NO,
      foreignOftFg: data.foreignOftFg || FOREIGN_OFT_FLAG.NO,
      
      createdBy: data.createdBy || 'API',
      userId: data.userId || 'API',
      rowTs: new Date(),
      createDt: new Date(),
      sysCreateTs: new Date(),
      versionNo: 1,
      
      isReversal: data.isReversal || data.IS_REVERSAL || false,
      ...(data.isReversal && {
        originalXferRef: data.originalXferRef || data.ORIGINAL_XFER_REF,
        reversalReason: data.reversalReason || data.REVERSAL_REASON,
        reversalDate: data.reversalDate || data.REVERSAL_DATE || new Date(),
        reversedBy: data.reversedBy || data.REVERSED_BY || 'SYSTEM'
      }),
      
      batchId: data.batchId || data.BATCH_ID,
      addtlInstruction1: data.addtlInstruction1 || data.ADDTL_INSTRUCTION1,
      addtlInstruction2: data.addtlInstruction2 || data.ADDTL_INSTRUCTION2,
      addtlInstruction3: data.addtlInstruction3 || data.ADDTL_INSTRUCTION3,
      addtlInstruction4: data.addtlInstruction4 || data.ADDTL_INSTRUCTION4,
      specInstruction: data.specInstruction || data.SPEC_INSTRUCTION
    };
  }
}

OutwardFundsTransfer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    xferRef: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    paymentMtdCd: { type: DataTypes.STRING(10), allowNull: true },
    chargesPayerCd: { type: DataTypes.STRING(10), allowNull: true },
    xferCrncyId: { type: DataTypes.INTEGER, allowNull: false },
    xferAmt: { type: DataTypes.DECIMAL(20, 2), allowNull: false, defaultValue: 0.00 },
    sendingBankChrg: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0.00 },
    receivingBankChrg: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'receiving_bank_chrg'   // correct spelling
    },
    nipTransactionFee: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0.00 },
    vatAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, defaultValue: 0.00 },
    totalChrg: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    netAmtXfered: { type: DataTypes.DECIMAL(20, 2), allowNull: true },
    payCrncyId: { type: DataTypes.INTEGER, allowNull: false },
    payExchRate: { type: DataTypes.DECIMAL(15, 6), allowNull: false, defaultValue: 1.000000 },
    payAmt: { type: DataTypes.DECIMAL(20, 2), allowNull: true },
    valueDt: { type: DataTypes.DATE, allowNull: false },
    processingDate: { type: DataTypes.DATE, allowNull: true },
    completedDate: { type: DataTypes.DATE, allowNull: true },
    priorityLevelCd: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'NORMAL' },
    supplementaryRef: { type: DataTypes.STRING(100), allowNull: true },
    xferPurposeId: { type: DataTypes.INTEGER, allowNull: true },
    payDetails: { type: DataTypes.STRING(4000), allowNull: true },
    fundsXferTyId: { type: DataTypes.INTEGER, allowNull: true },
    buId: { type: DataTypes.INTEGER, allowNull: true },
    
    beneficiaryNm: { type: DataTypes.STRING(100), allowNull: false },
    beneficiaryAcct: { type: DataTypes.STRING(60), allowNull: false },
    beneficiaryBicId: { type: DataTypes.INTEGER, allowNull: true },
    beneficiaryBankNm: { type: DataTypes.STRING(100), allowNull: false },
    beneficiaryBankCode: { type: DataTypes.STRING(20), allowNull: true },
    beneficiaryBankCntryId: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    beneficiaryEmail: { type: DataTypes.STRING(100), allowNull: true },
    beneficiaryPhone: { type: DataTypes.STRING(20), allowNull: true },
    beneficiaryAddrLine1: { type: DataTypes.STRING(100), allowNull: true },
    beneficiaryAddrLine2: { type: DataTypes.STRING(100), allowNull: true },
    beneficiaryCity: { type: DataTypes.STRING(50), allowNull: true },
    beneficiaryState: { type: DataTypes.STRING(50), allowNull: true },
    beneficiaryPostalCode: { type: DataTypes.STRING(20), allowNull: true },
    beneficiaryCountryId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    beneficiaryBvn: { type: DataTypes.STRING(20), allowNull: true },
    
    remitterNm: { type: DataTypes.STRING(100), allowNull: false },
    remitterAcctNo: { type: DataTypes.STRING(60), allowNull: false },
    remitterCustomerId: { type: DataTypes.INTEGER, allowNull: true },
    remitterEmail: { type: DataTypes.STRING(100), allowNull: true },
    remitterPhone: { type: DataTypes.STRING(20), allowNull: true },
    remitterAddrLine1: { type: DataTypes.STRING(100), allowNull: true },
    remitterAddrLine2: { type: DataTypes.STRING(100), allowNull: true },
    remitterCity: { type: DataTypes.STRING(50), allowNull: true },
    remitterState: { type: DataTypes.STRING(50), allowNull: true },
    remitterPostalCode: { type: DataTypes.STRING(20), allowNull: true },
    remitterCountryId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    remitterIdentTyId: { type: DataTypes.INTEGER, allowNull: true },
    remitterIdentNo: { type: DataTypes.STRING(60), allowNull: true },
    
    nipSessionId: { type: DataTypes.STRING(100), allowNull: true },
    nipResponseCode: { type: DataTypes.STRING(10), allowNull: true },
    nipChannelCode: { type: DataTypes.STRING(10), allowNull: true },
    nipDestinationInstitution: { type: DataTypes.STRING(10), allowNull: true },
    nipTransactionLocation: { type: DataTypes.STRING(255), allowNull: true },
    
    recSt: { type: DataTypes.ENUM(Object.values(RECORD_STATUS)), allowNull: false, defaultValue: RECORD_STATUS.PENDING },
    transactionStatus: { type: DataTypes.ENUM(Object.values(TRANSACTION_STATUS)), allowNull: false, defaultValue: TRANSACTION_STATUS.INITIATED },
    versionNo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    rowTs: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    userId: { type: DataTypes.STRING(24), allowNull: false },
    createDt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdBy: { type: DataTypes.STRING(24), allowNull: false },
    sysCreateTs: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    
    repairFg: { type: DataTypes.ENUM(Object.values(REPAIR_FLAG)), allowNull: false, defaultValue: REPAIR_FLAG.NO },
    foreignOftFg: { type: DataTypes.ENUM(Object.values(FOREIGN_OFT_FLAG)), allowNull: false, defaultValue: FOREIGN_OFT_FLAG.NO },
    
    addtlInstruction1: { type: DataTypes.STRING(256), allowNull: true },
    addtlInstruction2: { type: DataTypes.STRING(256), allowNull: true },
    addtlInstruction3: { type: DataTypes.STRING(256), allowNull: true },
    addtlInstruction4: { type: DataTypes.STRING(256), allowNull: true },
    specInstruction: { type: DataTypes.STRING(4000), allowNull: true },
    
    isReversal: { type: DataTypes.BOOLEAN, defaultValue: false },
    originalXferRef: { type: DataTypes.STRING(100), allowNull: true },
    reversalReason: { type: DataTypes.STRING(500), allowNull: true },
    reversalDate: { type: DataTypes.DATE, allowNull: true },
    reversedBy: { type: DataTypes.STRING(24), allowNull: true },
    
    batchId: { type: DataTypes.STRING(50), allowNull: true },
    settlementDate: { type: DataTypes.DATE, allowNull: true },
    
    // === Paystack specific fields ===
    paystackFee: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'paystack_fee'
    },
    amountReceived: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'amount_received'
    },
    paystackReference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'paystack_reference'
    },
    paystackVirtualAccount: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'paystack_virtual_account'
    },
    paystackVirtualAccountName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'paystack_virtual_account_name'
    },
    paystackBankName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'paystack_bank_name'
    },
    paystackBankSlug: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'paystack_bank_slug'
    },
    paystackExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'paystack_expires_at'
    },
    paystackResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'paystack_response'
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'failure_reason'
    }
  },
  {
    sequelize,
    modelName: 'OutwardFundsTransfer',
    tableName: 'OUTWARD_FUNDS_TRANSFERS',
    timestamps: false,
    underscored: true,
    hooks: {
      beforeCreate: (transfer) => {
        if (!transfer.netAmtXfered) {
          transfer.netAmtXfered = transfer.calculateNetAmount();
        }
        if (!transfer.totalChrg) {
          const sending = parseFloat(transfer.sendingBankChrg) || 0;
          const receiving = parseFloat(transfer.receivingBankChrg) || 0;
          const nip = parseFloat(transfer.nipTransactionFee) || 0;
          const vat = parseFloat(transfer.vatAmount) || 0;
          transfer.totalChrg = sending + receiving + nip + vat;
        }
        if (!transfer.rowTs) transfer.rowTs = new Date();
        if (!transfer.createDt) transfer.createDt = new Date();
        if (!transfer.sysCreateTs) transfer.sysCreateTs = new Date();
      },
      beforeUpdate: (transfer) => {
        if (transfer.transactionStatus === TRANSACTION_STATUS.PROCESSING && !transfer.processingDate) {
          transfer.processingDate = new Date();
        }
        if (transfer.transactionStatus === TRANSACTION_STATUS.COMPLETED && !transfer.completedDate) {
          transfer.completedDate = new Date();
        }
      }
    }
  }
);

export default OutwardFundsTransfer;