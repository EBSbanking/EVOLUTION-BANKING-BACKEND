import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class WebhookConfig extends Model {}

WebhookConfig.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    webhook_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    load_balancer_group: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'WebhookConfig',
    tableName: 'webhook_configs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default WebhookConfig;