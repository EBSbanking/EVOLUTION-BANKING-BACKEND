import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CustomerType extends Model {
  // Static method: Find active customer types
  static async findActive() {
    return this.findAll({
      where: { REC_ST: 'ACTIVE' },
      order: [['CUST_TY', 'ASC']]
    });
  }

  // Static method: Find by category
  static async findByCategory(category) {
    return this.findAll({
      where: { 
        CUST_CAT: category.toUpperCase(),
        REC_ST: 'ACTIVE'
      },
      order: [['CUST_TY', 'ASC']]
    });
  }

  // Static method: Get by ID
  static async getById(id) {
    return this.findByPk(id);
  }

  // Static method: Validate age for customer type
  static async validateAge(customerTypeId, age) {
    const customerType = await this.findByPk(customerTypeId);
    if (!customerType) {
      return { isValid: false, message: 'Customer type not found' };
    }

    if (age < customerType.MIN_AGE) {
      return { 
        isValid: false, 
        message: `Minimum age for ${customerType.CUST_TY} is ${customerType.MIN_AGE} years` 
      };
    }

    if (age > customerType.MAX_AGE) {
      return { 
        isValid: false, 
        message: `Maximum age for ${customerType.CUST_TY} is ${customerType.MAX_AGE} years` 
      };
    }

    return { isValid: true };
  }

  // Instance method: Check if active
  isActive() {
    return this.REC_ST === 'ACTIVE';
  }

  // Instance method: Deactivate
  async deactivate() {
    this.REC_ST = 'INACTIVE';
    return await this.save();
  }

  // Instance method: Activate
  async activate() {
    this.REC_ST = 'ACTIVE';
    return await this.save();
  }

  // Instance method: Get summary
  getSummary() {
    return {
      id: this.CUST_TY_ID,
      type: this.CUST_TY,
      category: this.CUST_CAT,
      description: this.DESCRIPTION,
      status: this.REC_ST,
      minAge: this.MIN_AGE,
      maxAge: this.MAX_AGE,
      ageRange: `${this.MIN_AGE} - ${this.MAX_AGE} years`,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Virtual getter: Age range description
  get ageRangeDescription() {
    return `${this.MIN_AGE} to ${this.MAX_AGE} years`;
  }
}

CustomerType.init({
  CUST_TY_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Customer type identifier'
  },
  
  CUST_TY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [2, 50]
    },
    comment: 'Customer type name'
  },
  
  CUST_CAT: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['INDIVIDUAL', 'CORPORATE', 'SME', 'GOVERNMENT', 'STAFF']]
    },
    comment: 'Customer category'
  },
  
  DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [10, 500]
    },
    comment: 'Customer type description'
  },
  
  REC_ST: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: {
      isIn: [['ACTIVE', 'INACTIVE']]
    },
    comment: 'Record status'
  },
  
  MIN_AGE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0,
      max: 150
    },
    comment: 'Minimum age requirement'
  },
  
  MAX_AGE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0,
      max: 150
    },
    comment: 'Maximum age requirement'
  },
  
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Record creation date'
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Record update date'
  },
  
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Record deletion date (soft delete)'
  }
}, {
  sequelize,
  modelName: 'CustomerType',
  tableName: 'CUSTOMER_TYPE',
  timestamps: true,
  paranoid: true, // Enable soft delete
  hooks: {
    beforeCreate: (customerType) => {
      // Ensure uppercase for enums
      if (customerType.CUST_CAT) {
        customerType.CUST_CAT = customerType.CUST_CAT.toUpperCase();
      }
      if (customerType.REC_ST) {
        customerType.REC_ST = customerType.REC_ST.toUpperCase();
      }
      
      // Validate age range
      if (customerType.MIN_AGE >= customerType.MAX_AGE) {
        throw new Error('MIN_AGE must be less than MAX_AGE');
      }
    },
    
    beforeUpdate: (customerType) => {
      // Ensure uppercase for enums
      if (customerType.changed('CUST_CAT') && customerType.CUST_CAT) {
        customerType.CUST_CAT = customerType.CUST_CAT.toUpperCase();
      }
      if (customerType.changed('REC_ST') && customerType.REC_ST) {
        customerType.REC_ST = customerType.REC_ST.toUpperCase();
      }
      
      // Validate age range
      if (customerType.changed('MIN_AGE') || customerType.changed('MAX_AGE')) {
        const minAge = customerType.MIN_AGE;
        const maxAge = customerType.MAX_AGE;
        if (minAge >= maxAge) {
          throw new Error('MIN_AGE must be less than MAX_AGE');
        }
      }
    }
  },
  indexes: [
    // Primary index
    { fields: ['CUST_TY_ID'], unique: true },
    
    // Unique constraint on type name
    { fields: ['CUST_TY'], unique: true },
    
    // Search indexes
    { fields: ['CUST_CAT'] },
    { fields: ['REC_ST'] },
    
    // Composite indexes
    { fields: ['CUST_CAT', 'REC_ST'] },
    { fields: ['REC_ST', 'CUST_TY'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'ACTIVE' }
    },
    inactive: {
      where: { REC_ST: 'INACTIVE' }
    },
    byCategory: (category) => ({
      where: { CUST_CAT: category.toUpperCase() }
    }),
    individual: {
      where: { CUST_CAT: 'INDIVIDUAL' }
    },
    corporate: {
      where: { CUST_CAT: 'CORPORATE' }
    },
    sme: {
      where: { CUST_CAT: 'SME' }
    },
    government: {
      where: { CUST_CAT: 'GOVERNMENT' }
    },
    staff: {
      where: { CUST_CAT: 'STAFF' }
    },
    withDeleted: {
      paranoid: false
    },
    recent: {
      order: [['createdAt', 'DESC']],
      limit: 50
    }
  }
});

export default CustomerType;