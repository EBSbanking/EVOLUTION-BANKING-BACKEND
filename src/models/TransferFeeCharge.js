// models/TransferFeeCharge.js – corrected with proper Op import
import { DataTypes, Model, Op } from 'sequelize';   // ✅ Import Op explicitly
import sequelize from '../../config/db.js';

// ========== NAMED EXPORTS (required by transferFeeController.js) ==========
export const FEE_TYPE = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
  TIERED: 'TIERED',
  SLAB: 'SLAB'
};

export const FEE_APPLICATION = {
  SENDER: 'SENDER',
  RECEIVER: 'RECEIVER',
  BOTH: 'BOTH',
  SHARED: 'SHARED'
};

export const CHARGE_BEARER = {
  SENDER: 'SENDER',
  RECEIVER: 'RECEIVER',
  SHARED: 'SHARED'
};

export const FEE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING'
};

export const FEE_FREQUENCY = {
  PER_TRANSACTION: 'PER_TRANSACTION',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY'
};
// =============================================================

class TransferFeeCharge extends Model {
  /**
   * Find a single applicable fee (for simple cases)
   */
  static async findApplicableFee(amount, chargeType = 'TRANSFER_FEE', currencyId = 3) {
    const fee = await this.findOne({
      where: {
        recSt: 'A',
        chargeType: chargeType,
        currencyId: currencyId,
        minAmount: { [Op.lte]: amount },
        [Op.or]: [
          { maxAmount: { [Op.gte]: amount } },
          { maxAmount: null }
        ]
      },
      order: [['minAmount', 'ASC']]
    });
    return fee;
  }

  /**
   * Find all applicable fees (required by transferFeeController)
   * @param {Object} params - { amount, channel, transactionType }
   * @returns {Promise<Array>} Array of TransferFeeCharge instances
   */
  static async findAllApplicableFees({ amount, channel, transactionType }) {
    // ✅ Use imported Op (no need to assign from sequelize)
    const fees = await this.findAll({
      where: {
        recSt: 'A',                     // Active only
        chargeType: 'TRANSFER_FEE',     // Only transfer fees
        [Op.and]: [
          // amount >= minAmount (if minAmount is not null)
          {
            [Op.or]: [
              { minAmount: { [Op.is]: null } },
              { minAmount: { [Op.lte]: amount } }
            ]
          },
          // amount <= maxAmount (if maxAmount is not null)
          {
            [Op.or]: [
              { maxAmount: { [Op.is]: null } },
              { maxAmount: { [Op.gte]: amount } }
            ]
          }
        ]
      },
      order: [['minAmount', 'ASC']]
    });

    return fees;
  }

  /**
   * Calculate fee for a given amount based on this fee rule
   */
  calculateFee(amount) {
    if (this.feeType === 'FIXED') {
      return parseFloat(this.feeAmount) || 0;
    } else if (this.feeType === 'PERCENTAGE') {
      const percentage = parseFloat(this.feePercentage) || 0;
      return (amount * percentage) / 100;
    }
    return 0;
  }
}

TransferFeeCharge.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    minAmount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'min_amount',
      validate: { min: 0 }
    },
    maxAmount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      field: 'max_amount',
      validate: { min: 0 }
    },
    feeAmount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      field: 'fee_amount',
      validate: { min: 0 }
    },
    feePercentage: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
      field: 'fee_percentage',
      validate: { min: 0, max: 100 }
    },
    feeType: {
      type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
      defaultValue: 'FIXED',
      field: 'fee_type'
    },
    chargeType: {
      type: DataTypes.STRING(50),
      defaultValue: 'TRANSFER_FEE',
      field: 'charge_type'
    },
    currencyId: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      field: 'currency_id'
    },
    recSt: {
      type: DataTypes.CHAR(1),
      defaultValue: 'A',
      field: 'rec_st',
      validate: { isIn: [['A', 'I']] }
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'TransferFeeCharge',
    tableName: 'transfer_fee_charges',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    hooks: {
      beforeValidate: (fee) => {
        if (fee.maxAmount !== null && fee.maxAmount < fee.minAmount) {
          throw new Error('maxAmount cannot be less than minAmount');
        }
        if (fee.feeType === 'FIXED' && (!fee.feeAmount || fee.feeAmount <= 0)) {
          throw new Error('FIXED fee requires positive feeAmount');
        }
        if (fee.feeType === 'PERCENTAGE' && (!fee.feePercentage || fee.feePercentage <= 0)) {
          throw new Error('PERCENTAGE fee requires positive feePercentage');
        }
      }
    }
  }
);

export default TransferFeeCharge;