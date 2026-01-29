// models/AML-simple.js - SIMPLIFIED VERSION
import { DataTypes, Sequelize } from 'sequelize';

// Direct connection - simplest approach
const sequelize = new Sequelize('core_banking', 'root', '', {
  host: '127.0.0.1',
  port: 3306,
  dialect: 'mysql',
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
});

const AML = sequelize.define('AML', {
  id: {
    type: DataTypes.CHAR(36),
    primaryKey: true,
    allowNull: false
  },
  CUST_ID: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  BVN: {
    type: DataTypes.STRING(11),
    unique: true,
    allowNull: false
  },
  NIN: {
    type: DataTypes.STRING(11),
    unique: true,
    allowNull: false
  },
  IS_PEP: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  IS_RCA: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  SANCTION_SCORE: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  SANCTION_MATCH: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  CUSTOMER_RISK_RATING: {
    type: DataTypes.ENUM('Low', 'Medium', 'High'),
    defaultValue: 'Low'
  },
  AML_STATUS: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected', 'Suspended', 'Deleted'),
    defaultValue: 'Pending'
  },
  NEXT_REVIEW_DATE: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'amls',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true
});

export default AML;