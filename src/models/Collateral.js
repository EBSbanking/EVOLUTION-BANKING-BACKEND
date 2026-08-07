// src/models/Collateral.js - FIXED FIELD MAPPINGS

import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Collateral extends Model {
  // ... (keep all existing methods)
}

Collateral.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    COLLATERAL_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    CUST_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    COLLATERAL_TY_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    COLLATERAL_TYPE_DESC: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    COLLATERAL_REF_NO: {
      type: DataTypes.STRING(35),
      allowNull: false,
    },
    COLLATERAL_DESC: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    COLLATERAL_CRNCY_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    COLLATERAL_COST: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
    },
    COLLATERAL_MARKET_VALUE: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
    },
    LENDING_PCT: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    COLLATERAL_EXPIRY_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    COLLATERAL_ISSUER_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    COLLATERAL_ISSUE_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    RATING_AGENCY_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    COLLATERAL_RATING: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ALT_COLLATERAL_DESC: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    VERIFIED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ADDR_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    COLLATERAL_LOCATION: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    REC_ST: {
      type: DataTypes.CHAR(1),
      allowNull: false,
      defaultValue: 'A',
    },
    VERSION_NO: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    ROW_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    USER_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    UNIT_CD: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    RATING_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    SYS_CREATE_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    CREATED_BY: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    LENDING_VALUE: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
    },
    CUMULATIVE_LIEN_AMT: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
      defaultValue: 0,
    },
    NO_OF_UNITS: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
    },
    OTHR_FACILITIES_FG: {
      type: DataTypes.CHAR(1),
      allowNull: false,
      defaultValue: 'N',
    },
    CHRGTAX_STLMNT_ACCT_NO: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    POLICY_NO: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    INSURANCE_CMPNY: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    POLICY_DETAILS: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    INSURED_AMT: {
      type: DataTypes.DECIMAL(38, 10),
      allowNull: true,
    },
    EXPIRY_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    RENEWAL_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    VALUATION_RPT_REF: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    VALUER: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    VALUATION_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    VALUATION_EXP_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    NEXT_REVIEW_DATE: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    LOAN_ACCOUNT_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    COLLATERAL_STATUS: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'Active',
    },
    // ✅ These fields match your database columns
    BU_ID: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'bu_id',
    },
    BRANCH_NAME: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'branch_name',
    },
    BRANCH_CODE: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'branch_code',
    },
    APPROVED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'approved_by',
    },
    APPROVED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_dt',
    },
    APPROVAL_NOTES: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'approval_notes',
    },
    REJECTED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'rejected_by',
    },
    REJECTED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_dt',
    },
    REJECTION_REASON: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
    DELETED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'deleted_by',
    },
    DELETED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_dt',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    }
  },
  {
    sequelize,
    modelName: 'Collateral',
    tableName: 'collateral',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    hooks: {
      beforeCreate: (collateral) => {
        if (!collateral.CREATE_DT) {
          collateral.CREATE_DT = new Date();
        }
        if (!collateral.SYS_CREATE_TS) {
          collateral.SYS_CREATE_TS = new Date();
        }
        if (!collateral.ROW_TS) {
          collateral.ROW_TS = new Date();
        }
        if (!collateral.REC_ST) {
          collateral.REC_ST = 'A';
        }
        if (!collateral.VERSION_NO) {
          collateral.VERSION_NO = 1;
        }
        if (!collateral.OTHR_FACILITIES_FG) {
          collateral.OTHR_FACILITIES_FG = 'N';
        }
      },
      beforeUpdate: (collateral) => {
        collateral.ROW_TS = new Date();
        collateral.updated_at = new Date();
      }
    }
  }
);

// ========== INSTANCE METHODS ==========
Collateral.prototype.getSummary = function() {
  return {
    id: this.id,
    collateralId: this.COLLATERAL_ID,
    referenceNo: this.COLLATERAL_REF_NO,
    description: this.COLLATERAL_DESC,
    type: this.COLLATERAL_TYPE_DESC || 'N/A',
    marketValue: parseFloat(this.COLLATERAL_MARKET_VALUE) || 0,
    cost: parseFloat(this.COLLATERAL_COST) || 0,
    lendingValue: parseFloat(this.LENDING_VALUE) || 0,
    lendingPercentage: parseFloat(this.LENDING_PCT) || 0,
    location: this.COLLATERAL_LOCATION || 'N/A',
    status: this.COLLATERAL_STATUS || 'Active',
    expiryDate: this.COLLATERAL_EXPIRY_DT,
    verifiedDate: this.VERIFIED_DT,
    isValid: this.isValid ? this.isValid() : true,
    loanAccountNo: this.LOAN_ACCOUNT_NO || null,
    branch: {
      branchName: this.BRANCH_NAME,
      branchCode: this.BRANCH_CODE,
      BU_ID: this.BU_ID
    }
  };
};

// ========== STATIC METHODS ==========
Collateral.getByLoanAccountNo = async function(loanAccountNo) {
  return await this.findAll({
    where: { LOAN_ACCOUNT_NO: loanAccountNo, REC_ST: 'A' }
  });
};

Collateral.getTotalValueByCustomer = async function(customerId) {
  const result = await this.sum('COLLATERAL_MARKET_VALUE', {
    where: { CUST_ID: customerId, REC_ST: 'A' }
  });
  return parseFloat(result) || 0;
};

Collateral.getCollateralTypes = async function() {
  const types = await this.findAll({
    attributes: [
      'COLLATERAL_TYPE_DESC',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    where: { REC_ST: 'A' },
    group: ['COLLATERAL_TYPE_DESC']
  });
  return types.map(t => ({
    type: t.COLLATERAL_TYPE_DESC || 'N/A',
    count: parseInt(t.get('count')) || 0
  }));
};

export default Collateral;