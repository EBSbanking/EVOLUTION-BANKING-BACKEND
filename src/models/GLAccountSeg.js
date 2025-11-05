import { DataTypes } from 'sequelize';
import { sequelize } from '../server.js'; // Import the sequelize instance from server.js
import GLAccount from './GLAccount';  // Assuming GLAccount is in the models folder

const GLAccountSeg = sequelize.define('GLAccountSeg', {
  GL_ACCT_SEG_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    unique: true,
    autoIncrement: true,
    comment: 'Account Segment Identifier',
  },
  GL_ACCT_STRUCT_ID: {
    type: DataTypes.STRING,  // Match the GLAccountNumber type in GLAccount model
    allowNull: false,
    comment: 'GL Account Structure Identifier (matches GLAccountNumber)',
  },
  POSN: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { len: [1, 3] }, // Ensures 3 digits for NUMBER(3)
    comment: 'Position in Account Segment',
  },
  PROMPT: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Prompt Text',
  },
  SEG_PLACEHLDR_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Segment Placeholder Identifier',
  },
  ACCT_SEG_DESC: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Account Segment Description',
  },
  SEG_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Segment Type Code',
  },
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    comment: 'Record State',
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version Number',
  },
  ROW_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp of Record',
  },
}, {
  tableName: 'GLACCOUNT_SEG',
  timestamps: false,
  freezeTableName: true,
});

// Define associations (Optional if you want to explicitly define them)
GLAccountSeg.belongsTo(GLAccount, { foreignKey: 'GL_ACCT_STRUCT_ID', targetKey: 'GLAccountNumber' });  // Match the foreign key with GLAccountNumber
GLAccount.hasMany(GLAccountSeg, { foreignKey: 'GL_ACCT_STRUCT_ID' });

export default GLAccountSeg;
