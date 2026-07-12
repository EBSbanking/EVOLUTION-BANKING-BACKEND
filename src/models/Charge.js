// models/Charge.js – with association to ChargeTier
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';  // adjust to your actual path
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
      // Legacy single‑tier fields (may be null for multi‑tier)
      minAmount: this.MIN_AMOUNT ? parseFloat(this.MIN_AMOUNT) : null,
      maxAmount: this.MAX_AMOUNT ? parseFloat(this.MAX_AMOUNT) : null,
      feeAmount: this.FEE_AMOUNT ? parseFloat(this.FEE_AMOUNT) : null,
      feePercentage: this.FEE_PERCENTAGE ? parseFloat(this.FEE_PERCENTAGE) : null,
      feeType: this.FEE_TYPE,
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

  // ✅ Association method – call this after importing ChargeTier
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
    field: 'CHRG_AMT'
  },
  CHRG_PCT: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
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
  // Legacy single‑tier columns (still present for backward compatibility)
  MIN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'MIN_AMOUNT'
  },
  MAX_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'MAX_AMOUNT'
  },
  FEE_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'FEE_AMOUNT'
  },
  FEE_PERCENTAGE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
    field: 'FEE_PERCENTAGE'
  },
  FEE_TYPE: {
    type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
    defaultValue: 'FIXED',
    field: 'FEE_TYPE'
  },
  // Virtual aliases (keep as needed)
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
  }
}, {
  sequelize,
  modelName: 'Charge',
  tableName: 'charges',
  timestamps: false,
  underscored: false,
  hooks: {
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
    },
    beforeUpdate: (charge) => {
      charge.ROW_TS = new Date();
      // Sync virtuals if needed
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
        'MIN_AMOUNT', 'MAX_AMOUNT', 'FEE_AMOUNT', 'FEE_PERCENTAGE', 'FEE_TYPE'
      ]
    },
    active: {
      where: { REC_ST: 'A' }
    }
  }
});

export default Charge;