// models/Organization.js - CORRECTED (explicit column mappings)
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Organization extends Model {}

Organization.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id',
    },
    organizationName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'organization_name', // ← explicit mapping
      validate: {
        notEmpty: { msg: 'organizationName is required' },
        len: { args: [2, 100], msg: 'Organization name must be between 2 and 100 characters' },
      },
    },
    organizationCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'organization_code', // ← explicit mapping
      validate: {
        notEmpty: { msg: 'organizationCode is required' },
        isInt: { msg: 'Organization code must be an integer' },
      },
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'description',
      validate: { len: { args: [0, 500], msg: 'Description cannot exceed 500 characters' } },
    },
    contactEmail: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'contact_email',
      validate: { isEmail: { msg: 'Please enter a valid email address' } },
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'phone_number',
      validate: {
        isValidPhone(value) {
          if (value && !/^\+?[\d\s\-()]{10,}$/.test(value)) {
            throw new Error('Please enter a valid phone number');
          }
        },
      },
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
      defaultValue: 'ACTIVE',
      field: 'status',
      validate: { isIn: { args: [['ACTIVE', 'INACTIVE', 'SUSPENDED']], msg: 'Status must be ACTIVE, INACTIVE, or SUSPENDED' } },
    },
  },
  {
    sequelize,
    modelName: 'Organization',
    tableName: 'organizations',
    timestamps: true,
    createdAt: 'created_at',   // ← snake_case for timestamps
    updatedAt: 'updated_at',
    hooks: {
      beforeValidate: (org) => {
        if (org.organizationName) org.organizationName = org.organizationName.trim();
        if (org.description) org.description = org.description.trim();
        if (org.contactEmail) org.contactEmail = org.contactEmail.trim().toLowerCase();
        if (org.phoneNumber) org.phoneNumber = org.phoneNumber.trim();
      },
    },
   
  }
);

// Static methods (unchanged, they use model attributes, not columns)
Organization.findActive = async function () {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['organizationName', 'ASC']],
  });
};

Organization.codeExists = async function (code) {
  const count = await this.count({ where: { organizationCode: code } });
  return count > 0;
};

Organization.findByCode = async function (code) {
  return await this.findOne({ where: { organizationCode: code } });
};

Organization.prototype.isActive = function () {
  return this.status === 'ACTIVE';
};

Organization.prototype.activate = async function () {
  this.status = 'ACTIVE';
  return await this.save();
};

Organization.prototype.deactivate = async function () {
  this.status = 'INACTIVE';
  return await this.save();
};

Organization.prototype.suspend = async function () {
  this.status = 'SUSPENDED';
  return await this.save();
};

export default Organization;
