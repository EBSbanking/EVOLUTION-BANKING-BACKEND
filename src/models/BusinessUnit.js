// models/BusinessUnit.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class BusinessUnit extends Model {}

BusinessUnit.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    BU_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      validate: {
        isInt: true,
        min: 1,
      },
    },
    BUSINESS_UNIT: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100],
      },
    },
    DESCRIPTION: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ADDRESS: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    STATUS: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      defaultValue: 'ACTIVE',
      validate: {
        isIn: [['ACTIVE', 'INACTIVE']],
      },
    },
    branch: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // 🔥 FIX: Add explicit timestamp columns
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
    modelName: 'BusinessUnit',
    tableName: 'business_units',
    timestamps: false, // 🔥 FIX: Disable Sequelize automatic timestamps
    underscored: false,
    indexes: [
      {
        unique: true,
        fields: ['BU_ID'],
        name: 'unique_bu_id',
      }
    ],
    hooks: {
      beforeValidate: (businessUnit) => {
        if (businessUnit.BUSINESS_UNIT) {
          businessUnit.BUSINESS_UNIT = businessUnit.BUSINESS_UNIT.trim();
        }
      }
    }
  }
);

// Association
BusinessUnit.associate = (models) => {
  BusinessUnit.belongsTo(models.Branch, {
    foreignKey: 'branch',
    as: 'Branch',
  });
};

export default BusinessUnit;
