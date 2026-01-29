// models/Charge.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import Decimal from 'decimal.js';

class Charge extends Model {
  // Instance method to check if charge is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Instance method to get simplified format
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

  // Virtual getter for formatted charge amount
  get formattedChargeAmount() {
    return this.CHRG_AMT ? new Decimal(this.CHRG_AMT.toString()).toFixed(2) : '0.00';
  }

  // Static method to find active charges
  static findActive() {
    return this.findAll({ where: { REC_ST: 'A' } });
  }

  // Static method to find by charge type
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
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: false,
    allowNull: false,
    unique: true
  },
  CHRG_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true
  },
  CHRG_TY: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  CHRG_NM: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  TIER_TY: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  CHRG_AMT: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: true
  },
  CHRG_PCT: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A'
  },
  EFFECTIVE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'system'
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    defaultValue: 'system'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3
  },
  INCOME_GL_ACCT_NO: {
    type: DataTypes.STRING(60),
    defaultValue: 'NONE'
  },
  BAL_ACTION_CD: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  CHRG_DESC: {
    type: DataTypes.STRING(100),
    defaultValue: 'description'
  },
  chargeType: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  chargeAmount: {
    type: DataTypes.DECIMAL(20, 6),
    allowNull: true
  },
  chargeGLAccountNo: {
    type: DataTypes.STRING(60),
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Charge',
  tableName: 'charges',
  timestamps: false, // Since we have our own timestamp fields
  hooks: {
    beforeCreate: (charge) => {
      const now = new Date();
      
      if (!charge.CREATE_DT) charge.CREATE_DT = now;
      if (!charge.ROW_TS) charge.ROW_TS = now;
      if (!charge.EFFECTIVE_DT) charge.EFFECTIVE_DT = now;
      if (!charge.USER_ID) charge.USER_ID = 'system';
      if (!charge.CREATED_BY) charge.CREATED_BY = 'system';
      if (!charge.VERSION_NO) charge.VERSION_NO = 1;

      // Synchronize simplified fields
      if (charge.chargeType && !charge.CHRG_TY) {
        charge.CHRG_TY = charge.chargeType;
      } else if (charge.CHRG_TY && !charge.chargeType) {
        charge.chargeType = charge.CHRG_TY;
      }

      if (charge.chargeAmount !== undefined && charge.chargeAmount !== null && !charge.CHRG_AMT) {
        charge.CHRG_AMT = charge.chargeAmount;
      } else if (charge.CHRG_AMT !== undefined && charge.CHRG_AMT !== null && !charge.chargeAmount) {
        charge.chargeAmount = charge.CHRG_AMT;
      }

      if (charge.chargeGLAccountNo && !charge.INCOME_GL_ACCT_NO) {
        charge.INCOME_GL_ACCT_NO = charge.chargeGLAccountNo;
      } else if (charge.INCOME_GL_ACCT_NO && !charge.chargeGLAccountNo) {
        charge.chargeGLAccountNo = charge.INCOME_GL_ACCT_NO;
      }
    },
    beforeUpdate: (charge) => {
      charge.ROW_TS = new Date();
      
      // Synchronize simplified fields
      if (charge.changed('chargeType') && charge.chargeType && !charge.changed('CHRG_TY')) {
        charge.CHRG_TY = charge.chargeType;
      } else if (charge.changed('CHRG_TY') && charge.CHRG_TY && !charge.changed('chargeType')) {
        charge.chargeType = charge.CHRG_TY;
      }

      if (charge.changed('chargeAmount') && charge.chargeAmount !== undefined && 
          charge.chargeAmount !== null && !charge.changed('CHRG_AMT')) {
        charge.CHRG_AMT = charge.chargeAmount;
      } else if (charge.changed('CHRG_AMT') && charge.CHRG_AMT !== undefined && 
                 charge.CHRG_AMT !== null && !charge.changed('chargeAmount')) {
        charge.chargeAmount = charge.CHRG_AMT;
      }

      if (charge.changed('chargeGLAccountNo') && charge.chargeGLAccountNo && 
          !charge.changed('INCOME_GL_ACCT_NO')) {
        charge.INCOME_GL_ACCT_NO = charge.chargeGLAccountNo;
      } else if (charge.changed('INCOME_GL_ACCT_NO') && charge.INCOME_GL_ACCT_NO && 
                 !charge.changed('chargeGLAccountNo')) {
        charge.chargeGLAccountNo = charge.INCOME_GL_ACCT_NO;
      }
    }
  },
  defaultScope: {
    attributes: {
      exclude: []
    }
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