import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const JournalEntry = sequelize.define('JournalEntry', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  entryNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  entryDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  description: { type: DataTypes.STRING(255) },
  reference: { type: DataTypes.STRING(50) },
  status: {
    type: DataTypes.ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'POSTED'),
    defaultValue: 'PENDING'
  },
  branchCode: { type: DataTypes.STRING(10) },
  totalDebit: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
  totalCredit: { type: DataTypes.DECIMAL(15,2), defaultValue: 0 },
  createdBy: { type: DataTypes.STRING(50) },
  approvedBy: { type: DataTypes.STRING(50) },
  approvalDate: { type: DataTypes.DATE },
  // Optional link to a customer transaction (if you want to tie GL to a specific customer TX)
  transactionId: { type: DataTypes.INTEGER, references: { model: 'Transactions', key: 'id' } },
  // For reversal tracking
  reversedFromId: { type: DataTypes.INTEGER, references: { model: 'JournalEntries', key: 'id' } },
}, { tableName: 'JournalEntries', timestamps: true });

export default JournalEntry;