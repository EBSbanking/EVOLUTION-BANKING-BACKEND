// models/Organization.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Organization extends Model {}

Organization.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  organizationName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: {
        msg: 'organizationName is required'
      },
      len: {
        args: [2, 100],
        msg: 'Organization name must be between 2 and 100 characters'
      }
    },
    comment: 'Organization name'
  },
  organizationCode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: {
        msg: 'organizationCode is required'
      },
      isInt: {
        msg: 'Organization code must be an integer'
      }
    },
    comment: 'Organization code'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    validate: {
      len: {
        args: [0, 500],
        msg: 'Description cannot exceed 500 characters'
      }
    },
    comment: 'Organization description'
  },
  contactEmail: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      isEmail: {
        msg: 'Please enter a valid email address'
      }
    },
    comment: 'Contact email'
  },
  phoneNumber: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      // Custom validation for phone number
      isValidPhone(value) {
        if (value && !/^\+?[\d\s\-()]{10,}$/.test(value)) {
          throw new Error('Please enter a valid phone number');
        }
      }
    },
    comment: 'Phone number'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
    defaultValue: 'ACTIVE',
    validate: {
      isIn: {
        args: [['ACTIVE', 'INACTIVE', 'SUSPENDED']],
        msg: 'Status must be ACTIVE, INACTIVE, or SUSPENDED'
      }
    },
    comment: 'Organization status'
  }
}, {
  sequelize,
  modelName: 'Organization',
  tableName: 'organizations',
  timestamps: true, // Creates createdAt and updatedAt automatically
  hooks: {
    beforeValidate: (organization) => {
      // Trim string fields
      if (organization.organizationName) {
        organization.organizationName = organization.organizationName.trim();
      }
      if (organization.description) {
        organization.description = organization.description.trim();
      }
      if (organization.contactEmail) {
        organization.contactEmail = organization.contactEmail.trim().toLowerCase();
      }
      if (organization.phoneNumber) {
        organization.phoneNumber = organization.phoneNumber.trim();
      }
    }
  },
  indexes: [
    {
      name: 'idx_organization_name',
      fields: ['organizationName']
    },
    {
      name: 'idx_organization_code',
      fields: ['organizationCode']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_name_status',
      fields: ['organizationName', 'status']
    }
  ]
});

// Static method to find active organizations
Organization.findActive = async function() {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['organizationName', 'ASC']]
  });
};

// Static method to check if organization code exists
Organization.codeExists = async function(code) {
  const count = await this.count({
    where: { organizationCode: code }
  });
  return count > 0;
};

// Static method to get organization by code
Organization.findByCode = async function(code) {
  return await this.findOne({
    where: { organizationCode: code }
  });
};

// Instance method to check if organization is active
Organization.prototype.isActive = function() {
  return this.status === 'ACTIVE';
};

// Instance method to activate organization
Organization.prototype.activate = async function() {
  this.status = 'ACTIVE';
  return await this.save();
};

// Instance method to deactivate organization
Organization.prototype.deactivate = async function() {
  this.status = 'INACTIVE';
  return await this.save();
};

// Instance method to suspend organization
Organization.prototype.suspend = async function() {
  this.status = 'SUSPENDED';
  return await this.save();
};

export default Organization;