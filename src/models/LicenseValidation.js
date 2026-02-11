// models/LicenseValidation.js - Make result optional
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LicenseValidation = sequelize.define('LicenseValidation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  license_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  validation_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  client_ip: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  client_info: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  result: {
    type: DataTypes.STRING(20),
    allowNull: true,  // Change from false to true
    defaultValue: null
  }
}, {
  tableName: 'license_validations',
  timestamps: false
});

export default LicenseValidation;