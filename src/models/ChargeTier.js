// models/ChargeTier.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';   // adjust to your actual DB config path

const ChargeTier = sequelize.define('ChargeTier', {
  tier_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  charge_id: {
    type: DataTypes.BIGINT,        // must match charges.CHRG_ID type
    allowNull: false
  },
  min_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  max_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  fee_type: {
    type: DataTypes.ENUM('FIXED', 'PERCENTAGE'),
    allowNull: false
  },
  fee_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  fee_percentage: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  }
}, {
  tableName: 'charge_tiers',
  timestamps: false,            // ✅ because the table has no created_at/updated_at
  underscored: true
});

export default ChargeTier;