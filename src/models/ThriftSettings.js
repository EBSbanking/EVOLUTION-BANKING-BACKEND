// models/ThriftSettings.js
import { DataTypes } from 'sequelize';

const ThriftSettings = (sequelize) => {
  const ThriftSettingsModel = sequelize.define('ThriftSettings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    setting_key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    setting_value: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  }, {
    tableName: 'thrift_settings',
    timestamps: true,
    underscored: true // Make sure there's a comma before this if there are more options
  });

  return ThriftSettingsModel;
};

export default ThriftSettings;