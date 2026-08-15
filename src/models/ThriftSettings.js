// src/models/ThriftSettings.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class ThriftSettings extends Model {}

ThriftSettings.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    settingKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'setting_key', // keep column name snake_case if existing
    },
    settingValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'setting_value',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    dataType: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
      defaultValue: 'string',
      field: 'data_type',
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_encrypted',
    },
  },
  {
    sequelize,
    modelName: 'ThriftSettings',
    tableName: 'thrift_settings',
    timestamps: true,
    freezeTableName: true,
    underscored: false, // use attribute names as is but we have field mapping for legacy
  }
);

export default ThriftSettings;
