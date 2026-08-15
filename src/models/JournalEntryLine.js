import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const JournalEntryLine = sequelize.define('JournalEntryLine', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  journalEntryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'JournalEntries',    // table name (case-sensitive)
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  glAccountId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'gl_accounts',      // table name as created (lowercase)
      key: 'id',
    },
    onDelete: 'RESTRICT',
  },
  debitAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  creditAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  branchCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
}, {
  tableName: 'JournalEntryLines',
  timestamps: true,
  underscored: false,
});

export default JournalEntryLine;
