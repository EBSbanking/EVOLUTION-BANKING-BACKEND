// models/LoginPolicy.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoginPolicy extends Model {}

LoginPolicy.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    earliest_login_time: {
      type: DataTypes.TIME,
      allowNull: false,
      defaultValue: '00:00:00',
    },
    latest_login_time: {
      type: DataTypes.TIME,
      allowNull: false,
      defaultValue: '23:59:59',
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    updated_by: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'LoginPolicy',
    tableName: 'loginpolicy',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default LoginPolicy;
