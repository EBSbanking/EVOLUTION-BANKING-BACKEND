// models/Charge.js (updated)
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
      version: this.VERSION_NO
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
}

Charge.init({
  CHRG_ID: {
    type: DataTypes.BIGINT,          // ✅ changed to BIGINT
    primaryKey: true,
    autoIncrement: true,             // ✅ enable auto increment
    allowNull: false,
    field: 'CHRG_ID'
  },
  CHRG_CD: {
    type: DataTypes.STRING(10),
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
  chargeType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'chargeType'
  },
  chargeAmount: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: true,
    field: 'chargeAmount'
  },
  chargeGLAccountNo: {
    type: DataTypes.STRING(60),
    allowNull: true,
    field: 'chargeGLAccountNo'
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

      if (charge.chargeType && !charge.CHRG_TY) charge.CHRG_TY = charge.chargeType;
      else if (charge.CHRG_TY && !charge.chargeType) charge.chargeType = charge.CHRG_TY;

      if (charge.chargeAmount !== undefined && charge.chargeAmount !== null && !charge.CHRG_AMT)
        charge.CHRG_AMT = charge.chargeAmount;
      else if (charge.CHRG_AMT !== undefined && charge.CHRG_AMT !== null && !charge.chargeAmount)
        charge.chargeAmount = charge.CHRG_AMT;

      if (charge.chargeGLAccountNo && !charge.INCOME_GL_ACCT_NO)
        charge.INCOME_GL_ACCT_NO = charge.chargeGLAccountNo;
      else if (charge.INCOME_GL_ACCT_NO && !charge.chargeGLAccountNo)
        charge.chargeGLAccountNo = charge.INCOME_GL_ACCT_NO;
    },
    beforeUpdate: (charge) => {
      charge.ROW_TS = new Date();
      if (charge.changed('chargeType') && charge.chargeType && !charge.changed('CHRG_TY'))
        charge.CHRG_TY = charge.chargeType;
      else if (charge.changed('CHRG_TY') && charge.CHRG_TY && !charge.changed('chargeType'))
        charge.chargeType = charge.CHRG_TY;

      if (charge.changed('chargeAmount') && charge.chargeAmount !== undefined && charge.chargeAmount !== null && !charge.changed('CHRG_AMT'))
        charge.CHRG_AMT = charge.chargeAmount;
      else if (charge.changed('CHRG_AMT') && charge.CHRG_AMT !== undefined && charge.CHRG_AMT !== null && !charge.changed('chargeAmount'))
        charge.chargeAmount = charge.CHRG_AMT;

      if (charge.changed('chargeGLAccountNo') && charge.chargeGLAccountNo && !charge.changed('INCOME_GL_ACCT_NO'))
        charge.INCOME_GL_ACCT_NO = charge.chargeGLAccountNo;
      else if (charge.changed('INCOME_GL_ACCT_NO') && charge.INCOME_GL_ACCT_NO && !charge.changed('chargeGLAccountNo'))
        charge.chargeGLAccountNo = charge.INCOME_GL_ACCT_NO;
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
        'SETLMNT_OPTN', 'CRNCY_ID', 'EFFECTIVE_DT', 'VERSION_NO'
      ]
    },
    active: {
      where: { REC_ST: 'A' }
    }
  }
});

export default Charge;