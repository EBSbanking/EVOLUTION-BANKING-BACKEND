import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class AMLThreshold extends Model {
  // Virtual getter for formatted threshold amount
  get formattedThreshold() {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: this.currency
    }).format(this.thresholdAmount);
  }

  // Instance methods can be added here
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
    defaultValue: 'DEFAULT',
    validate: {
      isIn: [['WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'DEFAULT']]
    }
  },
  thresholdAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.ENUM('NGN', 'USD', 'EUR', 'GBP'),
    allowNull: false,
    defaultValue: 'NGN',
    validate: {
      isIn: [['NGN', 'USD', 'EUR', 'GBP']],
      isUppercase: true
    }
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
    type: DataTypes.ARRAY(DataTypes.ENUM('INDIVIDUAL', 'BUSINESS', 'GOVERNMENT', 'ALL')),
    allowNull: true,
    defaultValue: []
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  updatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'AMLThreshold',
  tableName: 'aml_thresholds',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['transaction_type', 'currency', 'active'],
      where: { active: true }
    },
    {
      fields: ['transaction_type'],
      name: 'idx_transaction_type'
    },
    {
      fields: ['currency'],
      name: 'idx_currency'
    },
    {
      fields: ['active'],
      name: 'idx_active'
    },
    {
      fields: ['created_by'],
      name: 'idx_created_by'
    }
  ],
  hooks: {
    beforeCreate: (instance) => {
      // Set timezone for Nigeria if needed
      instance.createdAt = new Date();
      instance.updatedAt = new Date();
    },
    beforeUpdate: (instance) => {
      instance.updatedAt = new Date();
    }
  },
  validate: {
    validateAppliesTo() {
      if (this.appliesTo && this.appliesTo.length > 0) {
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