// models/Charge.js – with VAT and WHT support
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import Decimal from 'decimal.js';

class Charge extends Model {
  isActive() {
    return this.REC_ST === 'A';
  }

  toSimplified() {
    return {
      chargeId: this.CHRG_ID,
      chargeCode: this.CHRG_CD,
      chargeType: this.CHRG_TY,
      chargeName: this.CHRG_NM,
      chargeAmount: this.CHRG_AMT ? parseFloat(this.CHRG_AMT) : null,
      chargePercentage: this.CHRG_PCT ? parseFloat(this.CHRG_PCT) : null,
      chargeGLAccountNo: this.INCOME_GL_ACCT_NO,
      status: this.REC_ST,
      description: this.CHRG_DESC,
      tierType: this.TIER_TY,
      calculationBasis: this.CALC_BASIS_TY,
      settlementOption: this.SETLMNT_OPTN,
      currencyId: this.CRNCY_ID,
      effectiveDate: this.EFFECTIVE_DT,
      version: this.VERSION_NO,
      minAmount: this.MIN_AMOUNT ? parseFloat(this.MIN_AMOUNT) : null,
      maxAmount: this.MAX_AMOUNT ? parseFloat(this.MAX_AMOUNT) : null,
      feeAmount: this.FEE_AMOUNT ? parseFloat(this.FEE_AMOUNT) : null,
      feePercentage: this.FEE_PERCENTAGE ? parseFloat(this.FEE_PERCENTAGE) : null,
      feeType: this.FEE_TYPE,
      isVATApplicable: this.IS_VAT_APPLICABLE || false,
      vatRate: this.VAT_RATE ? parseFloat(this.VAT_RATE) : 7.5,
      vatGLAccountNo: this.VAT_GL_ACCOUNT_NO || null,
      isWHTApplicable: this.IS_WHT_APPLICABLE || false,
      whtRate: this.WHT_RATE ? parseFloat(this.WHT_RATE) : 5,
      whtGLAccountNo: this.WHT_GL_ACCOUNT_NO || null,
      whtType: this.WHT_TYPE || 'CORPORATE',
    };
  }

  get formattedChargeAmount() {
    return this.CHRG_AMT ? new Decimal(this.CHRG_AMT.toString()).toFixed(2) : '0.00';
  }

  static findActive() {
    return this.findAll({ where: { REC_ST: 'A' } });
  }

  static findByType(type) {
    return this.findAll({ 
      where: { 
        CHRG_TY: type.toUpperCase(),
        REC_ST: 'A'
      }
    });
  }

  static associate(models) {
    Charge.hasMany(models.ChargeTier, {
      foreignKey: 'charge_id',
      as: 'tiers',
      onDelete: 'CASCADE'
    });
  }
}

Charge.init({
  CHRG_ID: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'CHRG_ID'
  },
  CHRG_CD: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'CHRG_CD'
  },
  CHRG_TY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'CHRG_TY'
  },
  CHRG_NM: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'CHRG_NM'
  },
  TIER_TY: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'TIER_TY'
  },
  CHRG_AMT: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: true,
    defaultValue: null,
    field: 'CHRG_AMT'
  },
  CHRG_PCT: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
    defaultValue: null,
    field: 'CHRG_PCT'
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    field: 'REC_ST'
  },
  EFFECTIVE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'EFFECTIVE_DT'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'CREATE_DT'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'ROW_TS'
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'system',
    field: 'USER_ID'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'system',
    field: 'CREATED_BY'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'VERSION_NO'
  },
  CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    field: 'CRNCY_ID'
  },
  INCOME_GL_ACCT_NO: {
    type: DataTypes.STRING(60),
    defaultValue: 'NONE',
    field: 'INCOME_GL_ACCT_NO'
  },
  BAL_ACTION_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'BAL_ACTION_CD'
  },
  CHRG_DESC: {
    type: DataTypes.STRING(100),
    defaultValue: 'description',
    field: 'CHRG_DESC'
  },
  
  // ==================== LEGACY SINGLE-TIER COLUMNS ====================
  MIN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: null,
    field: 'MIN_AMOUNT'
  },
  MAX_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: null,
    field: 'MAX_AMOUNT'
  },
  FEE_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: null,
    field: 'FEE_AMOUNT'
  },
  FEE_PERCENTAGE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
    defaultValue: null,
    field: 'FEE_PERCENTAGE'
  },
  FEE_TYPE: {
    type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
    allowNull: true,
    defaultValue: null,
    field: 'FEE_TYPE',
    // ✅ CRITICAL FIX: Prevent Sequelize from setting a default value
    set(value) {
      if (value === undefined || value === null) {
        this.setDataValue('FEE_TYPE', null);
      } else {
        this.setDataValue('FEE_TYPE', value);
      }
    }
  },
  
  // ==================== VAT FIELDS ====================
  IS_VAT_APPLICABLE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'IS_VAT_APPLICABLE'
  },
  VAT_RATE: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 7.5,
    field: 'VAT_RATE'
  },
  VAT_GL_ACCOUNT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    defaultValue: null,
    field: 'VAT_GL_ACCOUNT_NO'
  },
  
  // ==================== WHT FIELDS ====================
  IS_WHT_APPLICABLE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'IS_WHT_APPLICABLE'
  },
  WHT_RATE: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 5,
    field: 'WHT_RATE'
  },
  WHT_GL_ACCOUNT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    defaultValue: null,
    field: 'WHT_GL_ACCOUNT_NO'
  },
  WHT_TYPE: {
    type: DataTypes.ENUM('CORPORATE', 'INDIVIDUAL', 'NON_RESIDENT', 'SME', 'GOVERNMENT', 'NGO'),
    allowNull: true,
    defaultValue: 'CORPORATE',
    field: 'WHT_TYPE'
  },

  // ==================== VIRTUAL FIELDS ====================
  chargeType: {
    type: DataTypes.VIRTUAL,
    get() { return this.CHRG_TY; },
    set(val) { this.CHRG_TY = val; }
  },
  chargeAmount: {
    type: DataTypes.VIRTUAL,
    get() { return this.CHRG_AMT; },
    set(val) { this.CHRG_AMT = val; }
  },
  chargePercentage: {
    type: DataTypes.VIRTUAL,
    get() { return this.CHRG_PCT; },
    set(val) { this.CHRG_PCT = val; }
  },
  chargeGLAccountNo: {
    type: DataTypes.VIRTUAL,
    get() { return this.INCOME_GL_ACCT_NO; },
    set(val) { this.INCOME_GL_ACCT_NO = val; }
  },
  status: {
    type: DataTypes.VIRTUAL,
    get() { return this.REC_ST; },
    set(val) { this.REC_ST = val; }
  },
  description: {
    type: DataTypes.VIRTUAL,
    get() { return this.CHRG_DESC; },
    set(val) { this.CHRG_DESC = val; }
  },
  isVATApplicable: {
    type: DataTypes.VIRTUAL,
    get() { return this.IS_VAT_APPLICABLE; },
    set(val) { this.IS_VAT_APPLICABLE = val; }
  },
  vatRate: {
    type: DataTypes.VIRTUAL,
    get() { return this.VAT_RATE; },
    set(val) { this.VAT_RATE = val; }
  },
  vatGLAccountNo: {
    type: DataTypes.VIRTUAL,
    get() { return this.VAT_GL_ACCOUNT_NO; },
    set(val) { this.VAT_GL_ACCOUNT_NO = val; }
  },
  isWHTApplicable: {
    type: DataTypes.VIRTUAL,
    get() { return this.IS_WHT_APPLICABLE; },
    set(val) { this.IS_WHT_APPLICABLE = val; }
  },
  whtRate: {
    type: DataTypes.VIRTUAL,
    get() { return this.WHT_RATE; },
    set(val) { this.WHT_RATE = val; }
  },
  whtGLAccountNo: {
    type: DataTypes.VIRTUAL,
    get() { return this.WHT_GL_ACCOUNT_NO; },
    set(val) { this.WHT_GL_ACCOUNT_NO = val; }
  },
  whtType: {
    type: DataTypes.VIRTUAL,
    get() { return this.WHT_TYPE; },
    set(val) { this.WHT_TYPE = val; }
  }
}, {
  sequelize,
  modelName: 'Charge',
  tableName: 'charges',
  timestamps: false,
  underscored: false,
  hooks: {
    // ✅ CRITICAL FIX: Run before validation
    beforeValidate: (charge) => {
      // Force FEE_TYPE to null for FLAT and PERCENTAGE
      if (charge.TIER_TY === 'FLAT' || charge.TIER_TY === 'PERCENTAGE') {
        charge.FEE_TYPE = null;
        charge.FEE_AMOUNT = null;
        charge.FEE_PERCENTAGE = null;
        charge.MIN_AMOUNT = null;
        charge.MAX_AMOUNT = null;
      }
    },
    beforeCreate: (charge) => {
      const now = new Date();
      if (!charge.CREATE_DT) charge.CREATE_DT = now;
      if (!charge.ROW_TS) charge.ROW_TS = now;
      if (!charge.EFFECTIVE_DT) charge.EFFECTIVE_DT = now;
      if (!charge.USER_ID) charge.USER_ID = 'system';
      if (!charge.CREATED_BY) charge.CREATED_BY = 'system';
      if (!charge.VERSION_NO) charge.VERSION_NO = 1;

      // Map virtuals
      if (charge.chargeType && !charge.CHRG_TY) charge.CHRG_TY = charge.chargeType;
      if (charge.chargeAmount !== undefined && charge.chargeAmount !== null && !charge.CHRG_AMT)
        charge.CHRG_AMT = charge.chargeAmount;
      if (charge.chargePercentage !== undefined && charge.chargePercentage !== null && !charge.CHRG_PCT)
        charge.CHRG_PCT = charge.chargePercentage;
      if (charge.chargeGLAccountNo && !charge.INCOME_GL_ACCT_NO)
        charge.INCOME_GL_ACCT_NO = charge.chargeGLAccountNo;
      if (charge.status && !charge.REC_ST) charge.REC_ST = charge.status;
      if (charge.description && !charge.CHRG_DESC) charge.CHRG_DESC = charge.description;
      
      if (charge.isVATApplicable !== undefined && charge.isVATApplicable !== null && !charge.IS_VAT_APPLICABLE)
        charge.IS_VAT_APPLICABLE = charge.isVATApplicable;
      if (charge.vatRate !== undefined && charge.vatRate !== null && !charge.VAT_RATE)
        charge.VAT_RATE = charge.vatRate;
      if (charge.vatGLAccountNo && !charge.VAT_GL_ACCOUNT_NO)
        charge.VAT_GL_ACCOUNT_NO = charge.vatGLAccountNo;
      
      if (charge.isWHTApplicable !== undefined && charge.isWHTApplicable !== null && !charge.IS_WHT_APPLICABLE)
        charge.IS_WHT_APPLICABLE = charge.isWHTApplicable;
      if (charge.whtRate !== undefined && charge.whtRate !== null && !charge.WHT_RATE)
        charge.WHT_RATE = charge.whtRate;
      if (charge.whtGLAccountNo && !charge.WHT_GL_ACCOUNT_NO)
        charge.WHT_GL_ACCOUNT_NO = charge.whtGLAccountNo;
      if (charge.whtType && !charge.WHT_TYPE)
        charge.WHT_TYPE = charge.whtType;

      // ✅ Ensure FEE_TYPE is null for FLAT/PERCENTAGE
      if (charge.TIER_TY === 'FLAT' || charge.TIER_TY === 'PERCENTAGE') {
        charge.FEE_TYPE = null;
        charge.FEE_AMOUNT = null;
        charge.FEE_PERCENTAGE = null;
        charge.MIN_AMOUNT = null;
        charge.MAX_AMOUNT = null;
      }
    },
    beforeUpdate: (charge) => {
      charge.ROW_TS = new Date();
      // ✅ Ensure FEE_TYPE is null for FLAT/PERCENTAGE on update
      if (charge.TIER_TY === 'FLAT' || charge.TIER_TY === 'PERCENTAGE') {
        charge.FEE_TYPE = null;
        charge.FEE_AMOUNT = null;
        charge.FEE_PERCENTAGE = null;
        charge.MIN_AMOUNT = null;
        charge.MAX_AMOUNT = null;
      }
    }
  },
  defaultScope: {
    attributes: { exclude: [] }
  },
  scopes: {
    simplified: {
      attributes: [
        'CHRG_ID', 'CHRG_CD', 'CHRG_TY', 'CHRG_NM', 
        'CHRG_AMT', 'CHRG_PCT', 'INCOME_GL_ACCT_NO',
        'REC_ST', 'CHRG_DESC', 'TIER_TY', 'CALC_BASIS_TY',
        'SETLMNT_OPTN', 'CRNCY_ID', 'EFFECTIVE_DT', 'VERSION_NO',
        'MIN_AMOUNT', 'MAX_AMOUNT', 'FEE_AMOUNT', 'FEE_PERCENTAGE', 'FEE_TYPE',
        'IS_VAT_APPLICABLE', 'VAT_RATE', 'VAT_GL_ACCOUNT_NO',
        'IS_WHT_APPLICABLE', 'WHT_RATE', 'WHT_GL_ACCOUNT_NO', 'WHT_TYPE'
      ]
    },
    active: {
      where: { REC_ST: 'A' }
    }
  }
});

export default Charge;
