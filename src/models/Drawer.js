// models/Drawer.js - Updated with VARCHAR for all ENUM fields
import { Model, DataTypes } from 'sequelize';
import sequelize from '../../config/db.js'; // adjust path as needed

class Drawer extends Model {
  static associate(models) {
    // Define associations here if needed
    this.hasMany(models.Vault, { foreignKey: 'drawer_ref', as: 'vaults' });
    this.belongsTo(models.User, { foreignKey: 'USER_ID', targetKey: 'id', as: 'user' });
    this.belongsTo(models.BusinessUnit, { foreignKey: 'BU_ID', targetKey: 'id', as: 'businessUnit' });
    this.belongsTo(models.Branch, { foreignKey: 'BRANCH_CODE', targetKey: 'code', as: 'branch' });
  }

  // Static method to ensure table exists
  static async ensureTableExists() {
    try {
      await this.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ Drawer table ready');
      return true;
    } catch (error) {
      console.error('❌ Error syncing Drawer table:', error.message);
      return false;
    }
  }

  // Instance method to check if drawer is open
  isOpen() {
    return this.WF_STATUS === 'OPEN';
  }

  // Instance method to check if drawer can process transactions
  canTransact() {
    return this.WF_STATUS === 'OPEN' && this.REC_ST === 'A';
  }

  // Instance method to get available balance
  getAvailableBalance() {
    return Math.max(0, parseFloat(this.CURRENT_BALANCE || 0) - parseFloat(this.MIN_BAL || 0));
  }

  // Instance method to check if balance exceeds limits
  isOverLimit() {
    return parseFloat(this.CURRENT_BALANCE || 0) > parseFloat(this.MAX_BAL || 0);
  }

  // Instance method to check if balance is below minimum
  isUnderLimit() {
    return parseFloat(this.CURRENT_BALANCE || 0) < parseFloat(this.MIN_BAL || 0);
  }
}

Drawer.init(
  {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    DRAWER_ID: { 
      type: DataTypes.INTEGER, 
      allowNull: false, 
      unique: true 
    },
    DRAWER_NO: { 
      type: DataTypes.STRING(50), 
      allowNull: false, 
      unique: true 
    },
    DRAWER_NM: { 
      type: DataTypes.STRING(100), 
      allowNull: true 
    },
    // ✅ Changed from ENUM to VARCHAR
    DRAWER_TY_CD: { 
      type: DataTypes.STRING(30), 
      allowNull: false,
      defaultValue: 'TELLER'
    },
    // ✅ Changed from ENUM to VARCHAR
    VAULT_TYPE: { 
      type: DataTypes.STRING(30), 
      defaultValue: 'BRANCH_VAULT',
      allowNull: true
    },
    // ✅ Changed from ENUM to VARCHAR
    SECURITY_LEVEL: { 
      type: DataTypes.STRING(20), 
      defaultValue: 'LEVEL_2',
      allowNull: true
    },
    REQUIRES_DUAL_CONTROL: { 
      type: DataTypes.BOOLEAN, 
      defaultValue: true 
    },
    VAULT_CAPACITY: { 
      type: DataTypes.DECIMAL(18,2), 
      defaultValue: 0 
    },
    USER_ID: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    BU_ID: { 
      type: DataTypes.STRING(50), 
      allowNull: true 
    },
    BRANCH_CODE: { 
      type: DataTypes.STRING(10),
      allowNull: true
    },
    GL_ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    CURRENT_BALANCE: { 
      type: DataTypes.DECIMAL(15,2), 
      defaultValue: 0.00 
    },
    MIN_BAL: { 
      type: DataTypes.DECIMAL(15,2), 
      defaultValue: 0.00 
    },
    MAX_BAL: { 
      type: DataTypes.DECIMAL(15,2), 
      defaultValue: 0.00 
    },
    TOTAL_INSURED_AMT: {
      type: DataTypes.DECIMAL(15,2),
      defaultValue: 0.00
    },
    OVERAGE_AMT: {
      type: DataTypes.DECIMAL(15,2),
      defaultValue: 0.00
    },
    SHORTAGE_AMT: {
      type: DataTypes.DECIMAL(15,2),
      defaultValue: 0.00
    },
    // ✅ Changed from ENUM to VARCHAR
    DRAWER_CASH_LIMIT_FG: {
      type: DataTypes.STRING(5),
      defaultValue: 'N'
    },
    // ✅ Changed from ENUM to VARCHAR
    DRAWER_INSURED_LIMIT_FG: {
      type: DataTypes.STRING(5),
      defaultValue: 'N'
    },
    DRAWER_LIMIT_EXCEED_TM: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // ✅ Changed from ENUM to VARCHAR
    WF_STATUS: { 
      type: DataTypes.STRING(30), 
      defaultValue: 'CLOSED' 
    },
    // ✅ Changed from ENUM to VARCHAR
    REC_ST: { 
      type: DataTypes.STRING(5), 
      defaultValue: 'A' 
    },
    CURRENT_ASSIGNEE_ID: { 
      type: DataTypes.STRING(50),
      defaultValue: '0'
    },
    CURRENT_ASSIGNEE_NAME: { 
      type: DataTypes.STRING(100),
      allowNull: true
    },
    // ✅ Changed from ENUM to VARCHAR
    CURRENT_ASSIGNEE_ROLE: { 
      type: DataTypes.STRING(30), 
      defaultValue: 'TELLER' 
    },
    VERSION_NO: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    LAST_DRAWER_OPEN_DT: {
      type: DataTypes.DATE,
      allowNull: true
    },
    LAST_DRAWER_CLOSE_DT: {
      type: DataTypes.DATE,
      allowNull: true
    },
    SESSION_START_BALANCE: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: true
    },
    SESSION_END_BALANCE: {
      type: DataTypes.DECIMAL(15,2),
      allowNull: true
    },
    OPENING_CURRENCY: {
      type: DataTypes.JSON,
      allowNull: true
    },
    CLOSING_CURRENCY: {
      type: DataTypes.JSON,
      allowNull: true
    },
    FORCE_CLOSED: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    FORCE_CLOSE_REASON: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    FORCE_CLOSED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    CREATED_BY: { 
      type: DataTypes.STRING(24), 
      allowNull: false 
    },
    CREATE_DT: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'Drawer',
    tableName: 'drawers',
    timestamps: true,
    underscored: false,
    // Add hooks for validation and logging
    hooks: {
      beforeCreate: (drawer) => {
        // Ensure CREATED_BY is set
        if (!drawer.CREATED_BY) {
          drawer.CREATED_BY = drawer.USER_ID || 'SYSTEM';
        }
        // Set CREATE_DT if not provided
        if (!drawer.CREATE_DT) {
          drawer.CREATE_DT = new Date();
        }
        // Ensure version starts at 1
        if (!drawer.VERSION_NO) {
          drawer.VERSION_NO = 1;
        }
        // Set drawer ID if not provided
        if (!drawer.DRAWER_ID) {
          drawer.DRAWER_ID = Math.floor(Math.random() * 10000) + 1000;
        }
      },
      beforeUpdate: (drawer) => {
        // Increment version on update
        drawer.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
        drawer.updatedAt = new Date();
      }
    }
  }
);

export default Drawer;