import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class AMLThreshold extends Model {
  get formattedThreshold() {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: this.currency
    }).format(this.thresholdAmount);
  }
}

AMLThreshold.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  transactionType: {
    type: DataTypes.ENUM('WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'DEFAULT'),
    allowNull: false,
    defaultValue: 'DEFAULT'
    // validate.isIn is redundant – ENUM already restricts values
  },
  thresholdAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: { min: 0 }
  },
  currency: {
    type: DataTypes.ENUM('NGN', 'USD', 'EUR', 'GBP'),
    allowNull: false,
    defaultValue: 'NGN'
    // Removed isUppercase (not a built-in validator)
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  appliesTo: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of values: INDIVIDUAL, BUSINESS, GOVERNMENT, ALL'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true
    // references removed to avoid foreign key error
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true
  }
  // Do NOT define createdAt / updatedAt – timestamps:true handles them
}, {
  sequelize,
  modelName: 'AMLThreshold',
  tableName: 'aml_thresholds',
  timestamps: true,      // auto-adds created_at & updated_at (underscored true)
  underscored: true,     // uses snake_case for auto columns
  hooks: {
    // Remove manual createdAt/updatedAt setting – Sequelize does it automatically
  },
  validate: {
    validateAppliesTo() {
      if (this.appliesTo && Array.isArray(this.appliesTo) && this.appliesTo.length > 0) {
        const validValues = ['INDIVIDUAL', 'BUSINESS', 'GOVERNMENT', 'ALL'];
        for (const value of this.appliesTo) {
          if (!validValues.includes(value)) {
            throw new Error(`Invalid appliesTo value: ${value}`);
          }
        }
      }
    }
  }
});

export default AMLThreshold;
