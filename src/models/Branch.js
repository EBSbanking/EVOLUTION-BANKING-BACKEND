// models/Branch.js - UPDATED WITH ALL FIELDS AND DEFAULT SCOPE
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Branch extends Model {}

Branch.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    organizationName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'organizationName',
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    organizationCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organizationCode',
      validate: {
        isInt: true,
        min: 1,
      },
    },
    branchName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'branchName',
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    branchCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
      field: 'branchCode',
      validate: {
        notEmpty: true,
        len: [3, 3],
        is: /^\d{3}$/,
      },
    },
    branchType: {
      type: DataTypes.ENUM('MAIN', 'REGIONAL', 'SUB', 'MOBILE'),
      defaultValue: 'MAIN',
      field: 'branchType',
      validate: {
        isIn: [['MAIN', 'REGIONAL', 'SUB', 'MOBILE']],
      },
    },
    businessUnitId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'businessUnitId',
    },
    BU_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'BU_ID',
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'created_by',
    },
    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'createdBy',
    },
    legacyId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'legacyId',
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'address',
    },
    external_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'external_id',
    },
    parent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'parent',
    },
    office_address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'office_address',
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'country',
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'state',
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'city',
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'phone',
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'email',
      validate: {
        isEmail: true,
      },
    },
    branch_manager: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'branch_manager',
    },
    opening_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'opening_date',
    },
    branch_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'branch_type',
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      defaultValue: 'ACTIVE',
      field: 'status',
      validate: {
        isIn: [['ACTIVE', 'INACTIVE']],
      },
    },
    operational_model: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'operational_model',
    },
    approved_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'approved_by',
    },
    migration_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'migration_id',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'Branch',
    tableName: 'branches',
    timestamps: false,
    underscored: false,
    // Add default scope to exclude problematic BankId column
    defaultScope: {
      attributes: { 
        exclude: [
          'BankId', 
          'bank_id', 
          'BankId', 
          'bankId', 
          'Bank_Id',
          'bank-id',
          'Bank-Id'
        ] 
      }
    },
   
    hooks: {
      beforeValidate: async (branch) => {
        // Auto-uppercase
        if (branch.organizationName) {
          branch.organizationName = branch.organizationName.toUpperCase().trim();
        }
        if (branch.branchName) {
          branch.branchName = branch.branchName.toUpperCase().trim();
        }
        if (branch.status) {
          branch.status = branch.status.toUpperCase();
        }

        // Validate branch code format
        if (branch.branchCode && !/^\d{3}$/.test(branch.branchCode)) {
          throw new Error('Branch code must be a 3-digit number');
        }
      }
    }
  }
);

// Association
Branch.associate = (models) => {
  Branch.hasOne(models.BusinessUnit, {
    foreignKey: 'branch',
    as: 'businessUnit'
  });
  
  // If there's an association with Bank that's causing the BankId column,
  // you can comment it out or fix it here
  // Branch.belongsTo(models.Bank, {
  //   foreignKey: 'bank_id', // Use actual column name if it exists
  //   as: 'bank'
  // });
};

export default Branch;
