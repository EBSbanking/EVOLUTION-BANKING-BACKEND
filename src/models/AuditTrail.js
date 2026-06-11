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
    // ✅ ONLY ONE PRIMARY KEY: event_id (auto-increment)
    event_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      field: 'event_id',
    },
    user_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'user_id',
    },
    user_role: {
      type: DataTypes.STRING(50),
      field: 'user_role',
    },
    event_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'event_type',
    },
    action: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'action',
    },
    old_value: {
      type: DataTypes.JSON,
      field: 'old_value',
    },
    new_value: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'new_value',
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type',
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'entity_id',
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
      field: 'additional_info',
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: 'ip_address',
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
  },
  {
    sequelize,
    modelName: 'AuditTrail',
    tableName: 'audit_trail',           // matches your actual table name
    timestamps: false,                  // we manage created_at/updated_at manually
    underscored: false,
    hooks: {
      beforeCreate: async (audit, options) => {
        // Set created_at/updated_at if not provided
        if (!audit.created_at) audit.created_at = new Date();
        if (!audit.updated_at) audit.updated_at = new Date();
      },
      beforeUpdate: async (audit, options) => {
        audit.updated_at = new Date();
      },
    },
  }
);

// ========== HELPER FUNCTIONS (unchanged) ==========
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
    } = auditData;

    if (!EVENT_TYPE || !USER_ID || !ACTION || !ENTITY_ID || !ENTITY_TYPE) {
      console.warn('Skipping audit trail: missing required fields', {
        EVENT_TYPE, USER_ID, ACTION, ENTITY_ID, ENTITY_TYPE
      });
      return null;
    }

    const now = new Date();
    const auditTrail = await AuditTrail.create(
      {
        event_type: EVENT_TYPE,
        user_id: USER_ID,
        user_role: USER_ROLE,
        action: ACTION,
        new_value: NEW_VALUE || null,
        old_value: OLD_VALUE,
        ip_address: String(IP_ADDRESS || '127.0.0.1'),
        user_agent: USER_AGENT,
        entity_id: ENTITY_ID,
        entity_type: ENTITY_TYPE,
        status: STATUS,
        description: DESCRIPTION,
        reference_no: REFERENCE_NO,
        account_no: ACCOUNT_NO,
        session_id: SESSION_ID,
        request_id: REQUEST_ID,
        endpoint: ENDPOINT,
        method: METHOD,
        additional_info: ADDITIONAL_INFO,
        timestamp: timestamp,
        created_at: now,
        updated_at: now,
      },
      { transaction }
    );

    console.log('✅ Audit trail created:', {
      event_id: auditTrail.event_id,
      event_type: EVENT_TYPE,
      entity_type: ENTITY_TYPE,
      entity_id: ENTITY_ID,
      created_at: auditTrail.created_at,
      updated_at: auditTrail.updated_at,
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