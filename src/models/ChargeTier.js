// models/ChargeTier.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';   // adjust to your actual DB config path

const ChargeTier = sequelize.define('ChargeTier', {
  tier_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  charge_id: {
    type: DataTypes.BIGINT,        // must match charges.CHRG_ID type
    allowNull: false,
    references: {
      model: 'charges',
      key: 'CHRG_ID'
    },
    onDelete: 'CASCADE'
  },
  min_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  max_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      customMax(value) {
        if (value !== null && value <= this.min_amount) {
          throw new Error('max_amount must be greater than min_amount');
        }
      }
    }
  },
  fee_type: {
    type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
    allowNull: false,
    defaultValue: 'FIXED'
  },
  fee_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      customFeeAmount(value) {
        if (this.fee_type === 'FIXED' && (value === null || value <= 0)) {
          throw new Error('FEE_AMOUNT is required when FEE_TYPE is FIXED. Please provide a positive fee amount.');
        }
      }
    }
  },
  fee_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: null,
    validate: {
      customFeePercentage(value) {
        if (this.fee_type === 'PERCENTAGE' && (value === null || value <= 0)) {
          throw new Error('FEE_PERCENTAGE is required when FEE_TYPE is PERCENTAGE. Please provide a positive percentage.');
        }
      }
    }
  }
}, {
  tableName: 'charge_tiers',
  timestamps: false,
  underscored: true,
  validate: {
    // Cross-field validation: ensure fee data matches fee_type
    validateFeeData() {
      if (this.fee_type === 'FIXED') {
        if (this.fee_amount === null || this.fee_amount <= 0) {
          throw new Error('FEE_AMOUNT is required when FEE_TYPE is FIXED. Please provide a positive fee amount.');
        }
        // Ensure fee_percentage is null for FIXED type
        if (this.fee_percentage !== null) {
          this.fee_percentage = null;
        }
      } else if (this.fee_type === 'PERCENTAGE') {
        if (this.fee_percentage === null || this.fee_percentage <= 0) {
          throw new Error('FEE_PERCENTAGE is required when FEE_TYPE is PERCENTAGE. Please provide a positive percentage.');
        }
        // Ensure fee_amount is null for PERCENTAGE type
        if (this.fee_amount !== null) {
          this.fee_amount = null;
        }
      }
    }
  },
  hooks: {
    beforeValidate: (tier) => {
      // Auto-cleanup: ensure only the relevant fee field has a value
      if (tier.fee_type === 'FIXED') {
        tier.fee_percentage = null;
      } else if (tier.fee_type === 'PERCENTAGE') {
        tier.fee_amount = null;
      }
    },
    beforeCreate: (tier) => {
      // Additional validation for first tier
      // This can be handled at the controller level
    }
  }
});

export default ChargeTier;