// models/FeeTransaction.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class FeeTransaction extends Model {
  static associate(models) {
    this.belongsTo(models.OutwardFundsTransfer, { foreignKey: 'transfer_id' });
  }
}

FeeTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    transfer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
    },
    fee_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'TRANSFER_FEE',
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'FeeTransaction',
    tableName: 'fee_transactions',
    timestamps: false,
    underscored: false,
  }
);

export default FeeTransaction;
