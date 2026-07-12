import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Module extends Model {}

Module.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Module title is required' },
        len: { args: [1, 100], msg: 'Title must be between 1 and 100 characters' },
      },
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Module label is required' },
        len: { args: [1, 100], msg: 'Label must be between 1 and 100 characters' },
      },
    },
    actionKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: 'Action key is required' },
        len: { args: [1, 100], msg: 'Action key must be between 1 and 100 characters' },
      },
    },
    permission: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    isModal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'all',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Module',
    tableName: 'modules',
    timestamps: true,
    underscored: false,
    sync: false, // prevent auto-sync issues
    hooks: {
      beforeUpdate: (module) => {
        module.updatedAt = new Date();
      },
    },
  }
);

export default Module;