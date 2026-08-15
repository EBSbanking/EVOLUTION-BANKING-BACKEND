// src/models/DrawerTransaction.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerTransaction extends Model {}

DrawerTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    drawer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'drawer',
        key: 'id',
      },
      validate: {
        notNull: {
          msg: 'Drawer ID is required',
        },
        isInt: {
          msg: 'Drawer ID must be an integer',
        },
      },
    },
    transaction_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Transaction type is required',
        },
        notEmpty: {
          msg: 'Transaction type cannot be empty',
        },
        isIn: {
          args: [['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'OPENING', 'CLOSING', 'ADJUSTMENT', 'REVERSAL']],
          msg: 'Invalid transaction type',
        },
      },
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Amount is required',
        },
        isDecimal: {
          msg: 'Amount must be a valid decimal number',
        },
        min: {
          args: [0.01],
          msg: 'Amount must be greater than 0',
        },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: {
          args: [0, 500],
          msg: 'Description cannot exceed 500 characters',
        },
      },
    },
    customer_account: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        len: {
          args: [0, 50],
          msg: 'Customer account cannot exceed 50 characters',
        },
      },
    },
    previous_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        isDecimal: {
          msg: 'Previous balance must be a valid decimal number',
        },
      },
    },
    new_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        isDecimal: {
          msg: 'New balance must be a valid decimal number',
        },
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'COMPLETED',
      validate: {
        isIn: {
          args: [['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED']],
          msg: 'Invalid status',
        },
      },
    },
    user_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        len: {
          args: [0, 50],
          msg: 'User ID cannot exceed 50 characters',
        },
      },
    },
    transaction_ref_no: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        len: {
          args: [0, 100],
          msg: 'Transaction reference cannot exceed 100 characters',
        },
      },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'DrawerTransaction',
    tableName: 'drawer_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_drawer_transactions_drawer_id',
        fields: ['drawer_id'],
      },
      {
        name: 'idx_drawer_transactions_created_at',
        fields: ['created_at'],
      },
      {
        name: 'idx_drawer_transactions_transaction_type',
        fields: ['transaction_type'],
      },
      {
        name: 'idx_drawer_transactions_status',
        fields: ['status'],
      },
      {
        name: 'idx_drawer_transactions_user_id',
        fields: ['user_id'],
      },
      {
        name: 'idx_drawer_transactions_transaction_ref_no',
        fields: ['transaction_ref_no'],
      },
    ],
    // Soft delete if needed
    paranoid: false,
    // Hooks for validation and logging
    hooks: {
      beforeCreate: (drawerTransaction) => {
        // Ensure amount is positive
        if (drawerTransaction.amount < 0) {
          throw new Error('Amount cannot be negative');
        }
        // Generate transaction reference if not provided
        if (!drawerTransaction.transaction_ref_no) {
          drawerTransaction.transaction_ref_no = `DRAWER-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        }
      },
      beforeUpdate: (drawerTransaction) => {
        // Ensure amount is positive
        if (drawerTransaction.amount < 0) {
          throw new Error('Amount cannot be negative');
        }
      },
      afterCreate: (drawerTransaction) => {
        console.log(`📊 Drawer transaction created: ${drawerTransaction.transaction_ref_no} for drawer ${drawerTransaction.drawer_id}`);
      },
    },
  }
);

// Association with Drawer model (if Drawer model exists)
export const associate = (models) => {
  if (models.Drawer) {
    DrawerTransaction.belongsTo(models.Drawer, {
      foreignKey: 'drawer_id',
      as: 'drawer',
    });
  }
};

export default DrawerTransaction;
