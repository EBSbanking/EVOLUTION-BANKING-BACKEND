// models/AuditTrail.js – Updated with proper timestamp handling
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import moment from 'moment-timezone';

class AuditTrail extends Model {
  // Virtual getters for timezone
  get timestamp_WAT() {
    return moment(this.timestamp).tz('Africa/Lagos').format();
  }
  
  get createdAt_WAT() {
    return moment(this.created_at).tz('Africa/Lagos').format();
  }
  
  get updatedAt_WAT() {
    return moment(this.updated_at).tz('Africa/Lagos').format();
  }

  // Static method to ensure table exists (for server.js loading)
  static async ensureTableExists() {
    try {
      await this.sync({ alter: process.env.NODE_ENV === 'development' });
      console.log('✅ AuditTrail table ready');
      return true;
    } catch (error) {
      console.error('❌ Error syncing AuditTrail table:', error.message);
      return false;
    }
  }

  // Ensure required columns exist (adds missing columns)
  static async ensureColumns() {
    try {
      const tableName = this.tableName;
      const [results] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      `, { replacements: [tableName] });
      
      const existingColumns = results.map(row => row.COLUMN_NAME);
      let columnsAdded = 0;
      
      // ✅ Add timestamp if missing
      if (!existingColumns.includes('timestamp')) {
        await sequelize.query(`
          ALTER TABLE \`${tableName}\` 
          ADD COLUMN timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        `);
        console.log(`✅ Added timestamp column to ${tableName}`);
        columnsAdded++;
      }
      
      // Add description if missing
      if (!existingColumns.includes('description')) {
        await sequelize.query(`
          ALTER TABLE \`${tableName}\` 
          ADD COLUMN description TEXT
        `);
        console.log(`✅ Added description column to ${tableName}`);
        columnsAdded++;
      }
      
      // Add branch_id if missing
      if (!existingColumns.includes('branch_id')) {
        await sequelize.query(`
          ALTER TABLE \`${tableName}\` 
          ADD COLUMN branch_id VARCHAR(10) DEFAULT NULL
        `);
        console.log(`✅ Added branch_id column to ${tableName}`);
        columnsAdded++;
      }
      
      // Add account_no if missing
      if (!existingColumns.includes('account_no')) {
        await sequelize.query(`
          ALTER TABLE \`${tableName}\` 
          ADD COLUMN account_no VARCHAR(50) DEFAULT NULL
        `);
        console.log(`✅ Added account_no column to ${tableName}`);
        columnsAdded++;
      }
      
      if (columnsAdded > 0) {
        console.log(`✅ Added ${columnsAdded} column(s) to ${tableName}`);
      } else {
        console.log(`✅ All required columns already exist in ${tableName}`);
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
    // ✅ PRIMARY KEY: event_id (auto-increment)
    event_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      field: 'event_id',
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'USER_ID',
    },
    user_role: {
      type: DataTypes.STRING(50),
      field: 'user_role',
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'EVENT_TYPE',
    },
    action: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'ACTION',
    },
    old_value: {
      type: DataTypes.JSON,
      field: 'OLD_VALUE',
    },
    new_value: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'NEW_VALUE',
    },
    // ✅ entity_type is now nullable
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'ENTITY_TYPE',
    },
    // ✅ entity_id is now nullable and STRING
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ENTITY_ID',
    },
    description: {
      type: DataTypes.TEXT,
      field: 'description',
    },
    reference_no: {
      type: DataTypes.STRING(100),
      field: 'reference_no',
    },
    additional_info: {
      type: DataTypes.JSON,
      field: 'ADDITIONAL_INFO',
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: 'IP_ADDRESS',
    },
    user_agent: {
      type: DataTypes.TEXT,
      field: 'user_agent',
    },
    status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PARTIAL_SUCCESS', 'PENDING', 'PROCESSING'),
      defaultValue: 'PENDING',
      field: 'status',
    },
    account_no: {
      type: DataTypes.STRING(50),
      field: 'account_no',
    },
    session_id: {
      type: DataTypes.STRING(100),
      field: 'session_id',
    },
    request_id: {
      type: DataTypes.STRING(100),
      field: 'request_id',
    },
    endpoint: {
      type: DataTypes.STRING(255),
      field: 'endpoint',
    },
    method: {
      type: DataTypes.STRING(10),
      field: 'method',
    },
    // ✅ timestamp with default value
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
      field: 'timestamp',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
    // ✅ branch column
    branch: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      field: 'branch',
    },
  },
  {
    sequelize,
    modelName: 'AuditTrail',
    tableName: 'audit_trail',
    timestamps: false,
    underscored: false,
    hooks: {
      beforeCreate: async (audit, options) => {
        if (!audit.created_at) audit.created_at = new Date();
        if (!audit.updated_at) audit.updated_at = new Date();
        if (!audit.timestamp) audit.timestamp = new Date();
      },
      beforeUpdate: async (audit, options) => {
        audit.updated_at = new Date();
      },
    },
  }
);

// ========== HELPER FUNCTIONS ==========
export const addAuditTrail = async (auditData, transaction = null) => {
  try {
    const {
      EVENT_TYPE,
      USER_ID,
      USER_ROLE,
      ACTION,
      NEW_VALUE,
      OLD_VALUE,
      IP_ADDRESS,
      USER_AGENT,
      ENTITY_ID,
      ENTITY_TYPE,
      STATUS = 'SUCCESS',
      DESCRIPTION,
      REFERENCE_NO,
      ACCOUNT_NO,
      SESSION_ID,
      REQUEST_ID,
      ENDPOINT,
      METHOD,
      ADDITIONAL_INFO,
      timestamp = new Date(),
      BRANCH = 1,
    } = auditData;

    // ✅ Only require essential fields - ENTITY_ID and ENTITY_TYPE are now optional
    if (!EVENT_TYPE || !USER_ID || !ACTION) {
      console.warn('Skipping audit trail: missing required fields', {
        EVENT_TYPE, USER_ID, ACTION
      });
      return null;
    }

    const now = new Date();
    
    // ✅ Build audit data with optional fields
    const auditPayload = {
      event_type: EVENT_TYPE,
      user_id: USER_ID,
      user_role: USER_ROLE || null,
      action: ACTION,
      new_value: NEW_VALUE || null,
      old_value: OLD_VALUE || null,
      ip_address: String(IP_ADDRESS || '127.0.0.1'),
      user_agent: USER_AGENT || null,
      status: STATUS || 'SUCCESS',
      description: DESCRIPTION || null,
      reference_no: REFERENCE_NO || null,
      account_no: ACCOUNT_NO || null,
      session_id: SESSION_ID || null,
      request_id: REQUEST_ID || null,
      endpoint: ENDPOINT || null,
      method: METHOD || null,
      additional_info: ADDITIONAL_INFO || null,
      branch: BRANCH || 1,
      timestamp: timestamp || now,
      created_at: now,
      updated_at: now,
    };

    // ✅ Only add ENTITY_ID and ENTITY_TYPE if they are provided
    if (ENTITY_ID) {
      auditPayload.entity_id = ENTITY_ID;
    }
    if (ENTITY_TYPE) {
      auditPayload.entity_type = ENTITY_TYPE;
    }

    const auditTrail = await AuditTrail.create(
      auditPayload,
      { transaction }
    );

    console.log('✅ Audit trail created:', {
      event_id: auditTrail.event_id,
      event_type: EVENT_TYPE,
      entity_type: ENTITY_TYPE || 'N/A',
      entity_id: ENTITY_ID || 'N/A',
      timestamp: auditTrail.timestamp,
      branch: auditTrail.branch,
      created_at: auditTrail.created_at,
    });

    return auditTrail;
  } catch (error) {
    console.error('❌ Error creating audit trail:', {
      error: error.message,
      stack: error.stack,
      auditData: {
        EVENT_TYPE: auditData.EVENT_TYPE,
        ENTITY_TYPE: auditData.ENTITY_TYPE,
        ENTITY_ID: auditData.ENTITY_ID,
      },
    });
    return null;
  }
};

// Export drawer helper functions
export const drawerAuditHelper = {
  drawerOpened: (userId, drawerId, drawerNo, openingCurrency, ipAddress, additionalData = {}) =>
    addAuditTrail({
      EVENT_TYPE: 'DRAWER_OPENED',
      USER_ID: userId,
      ACTION: 'Drawer Opened',
      NEW_VALUE: { status: 'OPEN', balance: additionalData.openingBalance || 0, currency: openingCurrency },
      OLD_VALUE: { status: 'CLOSED' },
      IP_ADDRESS: ipAddress,
      ENTITY_TYPE: 'Drawer',
      ENTITY_ID: drawerId,
      REFERENCE_NO: `DRAWER-OPEN-${Date.now()}`,
      DESCRIPTION: `Drawer ${drawerNo} opened by ${userId}`,
      ADDITIONAL_INFO: { drawer_no: drawerNo, opening_currency: openingCurrency, verified_by: additionalData.verifiedBy, opening_balance: additionalData.openingBalance }
    }),
  drawerClosed: (userId, drawerId, drawerNo, closingCurrency, finalBalance, ipAddress, additionalData = {}) =>
    addAuditTrail({
      EVENT_TYPE: 'DRAWER_CLOSED_WITH_CURRENCY',
      USER_ID: userId,
      ACTION: 'Drawer Closed',
      NEW_VALUE: { status: 'CLOSED', balance: finalBalance, currency: closingCurrency },
      OLD_VALUE: { status: 'OPEN', balance: additionalData.openingBalance },
      IP_ADDRESS: ipAddress,
      ENTITY_TYPE: 'Drawer',
      ENTITY_ID: drawerId,
      REFERENCE_NO: `DRAWER-CLOSE-${Date.now()}`,
      DESCRIPTION: `Drawer ${drawerNo} closed by ${userId}`,
      ADDITIONAL_INFO: { drawer_no: drawerNo, closing_currency: closingCurrency, expected_balance: additionalData.expectedBalance, difference: additionalData.difference, overage: additionalData.overage, shortage: additionalData.shortage, counted_by: additionalData.countedBy, verified_by: additionalData.verifiedBy }
    }),
  drawerTransaction: (userId, drawerId, drawerNo, transactionType, amount, previousBalance, newBalance, ipAddress, additionalData = {}) =>
    addAuditTrail({
      EVENT_TYPE: 'TRANSACTION_PROCESSED',
      USER_ID: userId,
      ACTION: `Drawer Transaction - ${transactionType}`,
      NEW_VALUE: { balance: newBalance },
      OLD_VALUE: { balance: previousBalance },
      IP_ADDRESS: ipAddress,
      ENTITY_TYPE: 'Drawer',
      ENTITY_ID: drawerId,
      REFERENCE_NO: additionalData.referenceNo || `TXN${Date.now()}`,
      DESCRIPTION: `${transactionType} transaction on drawer ${drawerNo}`,
      ADDITIONAL_INFO: { drawer_no: drawerNo, transaction_type: transactionType, amount: amount, effect: additionalData.effect, previous_balance: previousBalance, new_balance: newBalance, customer_account: additionalData.customerAccount, reference_no: additionalData.referenceNo }
    }),
  drawerToDrawerTransfer: (userId, sourceDrawerId, targetDrawerId, amount, transactionEffect, ipAddress, additionalData = {}) =>
    addAuditTrail({
      EVENT_TYPE: 'DRAWER_TO_DRAWER_TRANSFER',
      USER_ID: userId,
      ACTION: `Drawer to Drawer Transfer - ${transactionEffect}`,
      NEW_VALUE: { balance: additionalData.newBalance },
      OLD_VALUE: { balance: additionalData.previousBalance },
      IP_ADDRESS: ipAddress,
      ENTITY_TYPE: 'Drawer',
      ENTITY_ID: transactionEffect === 'DEBIT' ? sourceDrawerId : targetDrawerId,
      REFERENCE_NO: additionalData.referenceNo || `D2D-${Date.now()}`,
      DESCRIPTION: additionalData.description || 'Drawer to drawer transfer',
      ADDITIONAL_INFO: { source_drawer_no: additionalData.sourceDrawerNo, target_drawer_no: additionalData.targetDrawerNo, amount: amount, transfer_type: transactionEffect, currency_breakdown: additionalData.currencyBreakdown, verified_by: additionalData.verifiedBy, previous_balance: additionalData.previousBalance, new_balance: additionalData.newBalance, net_change: transactionEffect === 'CREDIT' ? amount : -amount }
    }),
  drawerCurrencyAdjustment: (userId, drawerId, drawerNo, previousBalance, newBalance, reason, ipAddress, additionalData = {}) =>
    addAuditTrail({
      EVENT_TYPE: 'DRAWER_CURRENCY_ADJUSTMENT',
      USER_ID: userId,
      ACTION: 'Drawer Currency Adjustment',
      NEW_VALUE: { balance: newBalance },
      OLD_VALUE: { balance: previousBalance },
      IP_ADDRESS: ipAddress,
      ENTITY_TYPE: 'Drawer',
      ENTITY_ID: drawerId,
      REFERENCE_NO: `DRAWER-ADJUST-${Date.now()}`,
      DESCRIPTION: `Drawer currency adjusted: ${reason}`,
      ADDITIONAL_INFO: { drawer_no: drawerNo, previous_balance: previousBalance, new_balance: newBalance, adjustment_amount: newBalance - previousBalance, currency_update: additionalData.currencyUpdate, reason: reason }
    })
};

export const logAuditTrail = async (
  entity_type,
  entity_id,
  user_id,
  action,
  old_value,
  new_value,
  ip_address,
  event_type = 'GENERAL',
  additional_info = null
) => {
  return addAuditTrail({
    EVENT_TYPE: event_type,
    USER_ID: user_id,
    ACTION: action,
    NEW_VALUE: new_value,
    OLD_VALUE: old_value,
    IP_ADDRESS: ip_address,
    ENTITY_ID: entity_id,
    ENTITY_TYPE: entity_type,
    STATUS: 'SUCCESS',
    DESCRIPTION: additional_info?.description,
    REFERENCE_NO: additional_info?.reference_no,
    ACCOUNT_NO: additional_info?.account_no,
    ADDITIONAL_INFO: additional_info,
  });
};

export default AuditTrail;