// models/Drawer.js - Updated model with proper field mappings
import { Model, DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class Drawer extends Model {
  static associate(models) {
    this.hasMany(models.Vault, { foreignKey: 'drawer_ref', as: 'vaults' });
    this.belongsTo(models.User, { foreignKey: 'USER_ID', targetKey: 'user_name', as: 'user' });
    this.belongsTo(models.BusinessUnit, { foreignKey: 'BU_ID', targetKey: 'BU_ID', as: 'businessUnit' });
    this.belongsTo(models.Branch, { foreignKey: 'BRANCH_CODE', targetKey: 'code', as: 'branch' });
  }

  // Static method to ensure table exists
  static async ensureTableExists() {
    try {
      await this.sync({ alter: false });
      console.log('✅ Drawer table synced successfully');
      return true;
    } catch (error) {
      console.error('❌ Error syncing Drawer table:', error.message);
      return false;
    }
  }

  isOpen() {
    return this.WF_STATUS === 'OPEN' || this.WF_STATUS === 'OPENED';
  }

  canTransact() {
    return this.isOpen() && this.REC_ST === 'A';
  }

  getAvailableBalance() {
    return Math.max(0, parseFloat(this.CURRENT_BALANCE || 0) - parseFloat(this.MIN_BAL || 0));
  }

  isOverLimit() {
    return parseFloat(this.CURRENT_BALANCE || 0) > parseFloat(this.MAX_BAL || 0);
  }

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
      type: DataTypes.STRING(50), 
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
    DRAWER_TY_CD: { 
      type: DataTypes.STRING(30), 
      allowNull: true,
      defaultValue: 'TELLER'
    },
    VAULT_TYPE: { 
      type: DataTypes.STRING(30), 
      defaultValue: 'BRANCH_VAULT',
      allowNull: true
    },
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
    DRAWER_CASH_LIMIT_FG: {
      type: DataTypes.STRING(5),
      defaultValue: 'N'
    },
    DRAWER_INSURED_LIMIT_FG: {
      type: DataTypes.STRING(5),
      defaultValue: 'N'
    },
    DRAWER_LIMIT_EXCEED_TM: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    WF_STATUS: { 
      type: DataTypes.STRING(30), 
      defaultValue: 'CLOSED' 
    },
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
      type: DataTypes.STRING(50), 
      allowNull: true,
      defaultValue: 'SYSTEM'
    },
    CREATE_DT: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'Drawer',
    tableName: 'drawer',  // Changed from 'drawers' to 'drawer' to match your table name
    timestamps: false,    // Disable timestamps since we have our own columns
    underscored: false,
    hooks: {
      beforeCreate: (drawer) => {
        if (!drawer.CREATED_BY) {
          drawer.CREATED_BY = drawer.USER_ID || 'SYSTEM';
        }
        if (!drawer.CREATE_DT) {
          drawer.CREATE_DT = new Date();
        }
        if (!drawer.VERSION_NO) {
          drawer.VERSION_NO = 1;
        }
        if (!drawer.DRAWER_ID) {
          drawer.DRAWER_ID = Math.floor(Math.random() * 10000) + 1000;
        }
        if (!drawer.WF_STATUS) {
          drawer.WF_STATUS = 'CLOSED';
        }
        if (!drawer.REC_ST) {
          drawer.REC_ST = 'A';
        }
        if (!drawer.DRAWER_TY_CD) {
          drawer.DRAWER_TY_CD = 'TELLER';
        }
        if (!drawer.created_at) {
          drawer.created_at = new Date();
        }
        if (!drawer.updated_at) {
          drawer.updated_at = new Date();
        }
        // Set default CURRENT_BALANCE to 0
        if (drawer.CURRENT_BALANCE === undefined || drawer.CURRENT_BALANCE === null) {
          drawer.CURRENT_BALANCE = 0;
        }
      },
      beforeUpdate: (drawer) => {
        drawer.VERSION_NO = (drawer.VERSION_NO || 0) + 1;
        drawer.updated_at = new Date();
      }
    }
  }
);

export default Drawer;
