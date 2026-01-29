// models/Drawer.js
import { Model, DataTypes } from 'sequelize';

class Drawer extends Model {
  static associate(models) {
    // Define associations here if needed
    this.hasMany(models.Vault, { foreignKey: 'drawer_ref', as: 'vaults' });
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
}

// Factory function for initialization
export function initializeDrawerModel(sequelize) {
  Drawer.init({
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
    DRAWER_TY_CD: { 
      type: DataTypes.ENUM('TELLER','VAULT','ATM','BRANCH','CASH_CENTER'), 
      allowNull: false,
      defaultValue: 'TELLER'
    },
    VAULT_TYPE: { 
      type: DataTypes.ENUM('MAIN_VAULT','BRANCH_VAULT','TEMPORARY_VAULT','CASH_VAULT','BULLION_VAULT','HIGH_SECURITY_VAULT'), 
      defaultValue: 'BRANCH_VAULT',
      allowNull: true
    },
    SECURITY_LEVEL: { 
      type: DataTypes.ENUM('LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4','LEVEL_5'), 
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
      type: DataTypes.ENUM('Y', 'N'),
      defaultValue: 'N'
    },
    DRAWER_INSURED_LIMIT_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      defaultValue: 'N'
    },
    DRAWER_LIMIT_EXCEED_TM: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    WF_STATUS: { 
      type: DataTypes.ENUM('OPEN','CLOSED','SUSPENDED','UNDER_MAINTENANCE','COUNT_IN_PROGRESS'), 
      defaultValue: 'CLOSED' 
    },
    REC_ST: { 
      type: DataTypes.ENUM('A','I','C'), 
      defaultValue: 'A' 
    },
    CURRENT_ASSIGNEE_ID: { 
      type: DataTypes.STRING(50), // CHANGED FROM INTEGER TO STRING
      defaultValue: '0' // CHANGED FROM 0 TO '0'
    },
    CURRENT_ASSIGNEE_NAME: { 
      type: DataTypes.STRING(100),
      allowNull: true
    },
    CURRENT_ASSIGNEE_ROLE: { 
      type: DataTypes.ENUM('TELLER','SUPERVISOR','MANAGER','VAULT_MANAGER','CASHIER'), 
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
  }, {
    sequelize,
    modelName: 'Drawer',
    tableName: 'drawers',
    timestamps: true,
    underscored: false,
    indexes: [
      { fields: ['DRAWER_ID'] },
      { fields: ['DRAWER_NO'] },
      { fields: ['WF_STATUS'] },
      { fields: ['REC_ST'] },
      { fields: ['BU_ID'] },
      { fields: ['BRANCH_CODE'] },
      { fields: ['USER_ID'] }
    ]
  });

  return Drawer;
}

// Also keep the traditional init method for backward compatibility
Drawer.initModel = function(sequelize) {
  return initializeDrawerModel(sequelize);
};

// Export both the class and initialization function
export default Drawer;