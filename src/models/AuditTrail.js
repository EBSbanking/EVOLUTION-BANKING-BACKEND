// models/AuditTrail.js – Full corrected version
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import moment from 'moment-timezone';

class AuditTrail extends Model {
  get timestamp_WAT() {
    return moment(this.timestamp).tz('Africa/Lagos').format();
  }
  get createdAt_WAT() {
    return moment(this.created_at).tz('Africa/Lagos').format();
  }
  get updatedAt_WAT() {
    return moment(this.updated_at).tz('Africa/Lagos').format();
  }

  static async ensureTableExists() {
    try {
      await this.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ AuditTrail table synchronized');
      return true;
    } catch (error) {
      console.error('❌ Error syncing AuditTrail table:', error.message);
      return false;
    }
  }

  static async ensureColumns() {
    try {
      const tableName = this.tableName;
      const [results] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `, { replacements: [tableName] });
      
      const existing = results.map(r => r.COLUMN_NAME);
      const needed = {
        'timestamp': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'description': 'TEXT',
        'account_no': 'VARCHAR(50) DEFAULT NULL',
        'branch': 'INT DEFAULT 1',
        'user_role': 'VARCHAR(50) DEFAULT NULL',
        'reference_no': 'VARCHAR(100) DEFAULT NULL',
        'session_id': 'VARCHAR(100) DEFAULT NULL',
        'request_id': 'VARCHAR(100) DEFAULT NULL',
        'endpoint': 'VARCHAR(255) DEFAULT NULL',
        'method': 'VARCHAR(10) DEFAULT NULL',
        'user_agent': 'TEXT',
        'ADDITIONAL_INFO': 'JSON',
        'OLD_VALUE': 'JSON',
        'NEW_VALUE': 'JSON'
      };
      const toAdd = Object.entries(needed)
        .filter(([col]) => !existing.includes(col))
        .map(([col, def]) => `ADD COLUMN \`${col}\` ${def}`);
      
      if (toAdd.length) {
        await sequelize.query(`ALTER TABLE \`${tableName}\` ${toAdd.join(', ')}`);
        console.log(`✅ Added ${toAdd.length} missing columns to ${tableName}`);
      } else {
        console.log(`✅ All columns exist in ${tableName}`);
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to ensure audit_trail columns:', error.message);
      return false;
    }
  }
}

AuditTrail.init(
  {
    event_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, field: 'event_id' },
    user_id: { type: DataTypes.STRING(100), allowNull: false, field: 'USER_ID' },
    user_role: { type: DataTypes.STRING(50), allowNull: true, field: 'user_role' },
    event_type: { type: DataTypes.STRING(100), allowNull: false, field: 'EVENT_TYPE' },
    action: { type: DataTypes.STRING(200), allowNull: false, field: 'ACTION' },
    old_value: { type: DataTypes.JSON, allowNull: true, field: 'OLD_VALUE' },
    new_value: { type: DataTypes.JSON, allowNull: true, field: 'NEW_VALUE' },
    entity_type: { type: DataTypes.STRING(50), allowNull: true, field: 'ENTITY_TYPE' },
    entity_id: { type: DataTypes.STRING(255), allowNull: true, field: 'ENTITY_ID' },
    description: { type: DataTypes.TEXT, allowNull: true, field: 'description' },
    reference_no: { type: DataTypes.STRING(100), allowNull: true, field: 'reference_no' },
    additional_info: { type: DataTypes.JSON, allowNull: true, field: 'ADDITIONAL_INFO' },
    ip_address: { type: DataTypes.STRING(45), allowNull: false, field: 'IP_ADDRESS' },
    user_agent: { type: DataTypes.TEXT, allowNull: true, field: 'user_agent' },
    status: { type: DataTypes.ENUM('SUCCESS','FAILED','PARTIAL_SUCCESS','PENDING','PROCESSING'), defaultValue: 'PENDING', field: 'status' },
    account_no: { type: DataTypes.STRING(50), allowNull: true, field: 'account_no' },
    session_id: { type: DataTypes.STRING(100), allowNull: true, field: 'session_id' },
    request_id: { type: DataTypes.STRING(100), allowNull: true, field: 'request_id' },
    endpoint: { type: DataTypes.STRING(255), allowNull: true, field: 'endpoint' },
    method: { type: DataTypes.STRING(10), allowNull: true, field: 'method' },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'timestamp' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' },
    branch: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1, field: 'branch' },
  },
  {
    sequelize,
    modelName: 'AuditTrail',
    tableName: 'audit_trail',
    timestamps: false,
    underscored: false,
    hooks: {
      beforeCreate: (audit) => {
        const now = new Date();
        if (!audit.created_at) audit.created_at = now;
        if (!audit.updated_at) audit.updated_at = now;
        if (!audit.timestamp) audit.timestamp = now;
      },
      beforeUpdate: (audit) => { audit.updated_at = new Date(); },
    },
  }
);

// ---- Core logging function (never throws) ----
export const addAuditTrail = async (auditData, transaction = null) => {
  try {
    const { EVENT_TYPE, USER_ID, ACTION, IP_ADDRESS = '127.0.0.1', STATUS = 'SUCCESS', BRANCH = 1, ...rest } = auditData;
    if (!EVENT_TYPE || !USER_ID || !ACTION) {
      console.warn('⚠️ Skipping audit: missing required fields', { EVENT_TYPE, USER_ID, ACTION });
      return null;
    }
    const now = new Date();
    const payload = {
      event_type: EVENT_TYPE, user_id: USER_ID, user_role: rest.USER_ROLE || null,
      action: ACTION, new_value: rest.NEW_VALUE || null, old_value: rest.OLD_VALUE || null,
      ip_address: String(IP_ADDRESS), user_agent: rest.USER_AGENT || null, status: STATUS,
      description: rest.DESCRIPTION || null, reference_no: rest.REFERENCE_NO || null,
      account_no: rest.ACCOUNT_NO || null, session_id: rest.SESSION_ID || null,
      request_id: rest.REQUEST_ID || null, endpoint: rest.ENDPOINT || null,
      method: rest.METHOD || null, additional_info: rest.ADDITIONAL_INFO || null,
      branch: BRANCH || 1, timestamp: rest.timestamp || now,
      created_at: now, updated_at: now,
    };
    if (rest.ENTITY_ID) payload.entity_id = rest.ENTITY_ID;
    if (rest.ENTITY_TYPE) payload.entity_type = rest.ENTITY_TYPE;
    const result = await AuditTrail.create(payload, { transaction });
    console.log(`✅ Audit trail created: ${EVENT_TYPE} (ID: ${result.event_id})`);
    return result;
  } catch (error) {
    console.error('❌ Audit error:', error.message);
    return null;
  }
};

// ---- Export helpers ----
export const drawerAuditHelper = { /* ... keep your existing ones ... */ };
export const logAuditTrail = async (entity_type, entity_id, user_id, action, old_value, new_value, ip_address, event_type = 'GENERAL', additional_info = null) => {
  return addAuditTrail({ EVENT_TYPE: event_type, USER_ID: user_id, ACTION: action, NEW_VALUE: new_value, OLD_VALUE: old_value, IP_ADDRESS: ip_address, ENTITY_ID: entity_id, ENTITY_TYPE: entity_type, STATUS: 'SUCCESS', DESCRIPTION: additional_info?.description, REFERENCE_NO: additional_info?.reference_no, ACCOUNT_NO: additional_info?.account_no, ADDITIONAL_INFO: additional_info });
};

export default AuditTrail;