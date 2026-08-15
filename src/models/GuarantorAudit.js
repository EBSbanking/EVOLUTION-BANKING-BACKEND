// models/GuarantorAudit.js - MORE FLEXIBLE VERSION
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GuarantorAudit extends Model {}

GuarantorAudit.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  guarantorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reference to the guarantor being audited'
  },
  action: {
    type: DataTypes.STRING(50), // Changed from ENUM to STRING
    allowNull: false,
    comment: 'Action performed (CREATE, UPDATE, DELETE, FEE_CREATED, etc.)'
  },
  changedFields: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: 'Array of field names that were changed'
  },
  previousValues: {
    type: DataTypes.JSON,
    comment: 'JSON object containing previous values of changed fields'
  },
  performedBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Username or ID of the person who performed the action'
  },
  notes: {
    type: DataTypes.TEXT,
    comment: 'Additional notes about the audit entry'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    comment: 'IP address of the user who performed the action'
  },
  // Store relationship officer data as JSON (not as a separate model)
  relationshipOfficerData: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'Relationship officer information at the time of audit'
  }
}, {
  sequelize,
  modelName: 'GuarantorAudit',
  tableName: 'guarantor_audits',
  timestamps: true,
  
  comment: 'Audit trail for all guarantor-related activities'
});

export default GuarantorAudit;
