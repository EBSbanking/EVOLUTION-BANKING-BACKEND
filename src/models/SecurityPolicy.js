// models/SecurityPolicy.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const SecurityPolicy = sequelize.define('SecurityPolicy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  SEC_PLCY_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'sec_plcy_id'
  },
  policy_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'policy_name'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'description'
  },
  ENFORCE_BIO_VRFCTN_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enforce_bio_verification'
  },
  GRACE_LOGIN_PD: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'grace_login_period'
  },
  MAX_FAILED_LOGIN_ATTEMPTS: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    field: 'max_failed_login_attempts'
  },
  PREVENT_PASSWD_REUSE_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'prevent_password_reuse'
  },
  PASSWD_CHANGE_FREQ: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    field: 'password_change_freq'
  },
  PASSWD_MIN_LENGTH: {
    type: DataTypes.INTEGER,
    defaultValue: 8,
    field: 'password_min_length'
  },
  PASSWD_MAX_LENGTH: {
    type: DataTypes.INTEGER,
    defaultValue: 64,
    field: 'password_max_length'
  },
  ENFORCE_SLCTD_CHARSET_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enforce_selected_charset'
  },
  SELECTED_CHARACTERSET: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'selected_characterset'
  },
  ENFORCE_SPEC_CHAR_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enforce_special_char'
  },
  SPEC_CHAR_POSN_CD: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'special_char_position_code'
  },
  MANDATORY_CHAR_POSN_CD: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'mandatory_char_position_code'
  },
  SPEC_CHAR_POSN: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'special_char_position'
  },
  ENFORCE_NUMERIC_CHAR_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enforce_numeric_char'
  },
  NUMERIC_CHAR_POSN: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'numeric_char_position'
  },
  ENFORCE_MANDATORY_CHAR_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'enforce_mandatory_char'
  },
  REC_ST: {
    type: DataTypes.STRING(20),
    defaultValue: 'ACTIVE',
    field: 'record_state'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'version_no'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'row_timestamp'
  },
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'user_id'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'create_date'
  },
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'created_by'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'sys_create_timestamp'
  },
  PASSWD_EXP_NOTIFICATION: {
    type: DataTypes.INTEGER,
    defaultValue: 7,
    field: 'password_exp_notification'
  },
  SUSPEND_USER_AFTER_DAYS: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
    field: 'suspend_user_after_days'
  },
  USER_ACTIVATE_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_activate_bu_proc_id'
  },
  USER_REMOVAL_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_removal_bu_proc_id'
  },
  USER_MODIFY_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_modify_bu_proc_id'
  },
  USER_ROLE_ACTIVATE_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_role_activate_bu_proc_id'
  },
  USER_ROLE_DEACT_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_role_deact_bu_proc_id'
  },
  USER_ROLE_MODIFY_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_role_modify_bu_proc_id'
  },
  USER_ROLE_ADDITION_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_role_addition_bu_proc_id'
  },
  PWD_REUSE_OPT: {
    type: DataTypes.ENUM('none', 'last_3', 'last_5', 'last_10', 'all'),
    defaultValue: 'none',
    field: 'password_reuse_option'
  },
  USER_DEACTIVATE_BU_PROC_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'user_deactivate_bu_proc_id'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    field: 'status'
  },
  created_by_user: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'created_by_user'
  },
  updated_by_user: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'updated_by_user'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'security_policies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['sec_plcy_id']
    },
    {
      unique: false,
      fields: ['policy_name']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['created_by_user']
    }
  ]
});

// Helper methods for SecurityPolicy
SecurityPolicy.createPolicy = async (policyData, userId) => {
  try {
    // Generate SEC_PLCY_ID if not provided
    if (!policyData.SEC_PLCY_ID) {
      const timestamp = Date.now();
      policyData.SEC_PLCY_ID = `SECPOL-${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    // Set created by fields
    policyData.USER_ID = policyData.USER_ID || userId.toString();
    policyData.CREATED_BY = policyData.CREATED_BY || userId.toString();
    policyData.created_by_user = userId;
    
    const policy = await SecurityPolicy.create(policyData);
    return policy;
  } catch (error) {
    console.error('Error creating security policy:', error.message);
    throw error;
  }
};

SecurityPolicy.getActivePolicy = async () => {
  try {
    const policy = await SecurityPolicy.findOne({
      where: {
        status: 'active',
        REC_ST: 'ACTIVE'
      },
      order: [['VERSION_NO', 'DESC'], ['created_at', 'DESC']]
    });
    
    return policy;
  } catch (error) {
    console.error('Error getting active security policy:', error.message);
    throw error;
  }
};

SecurityPolicy.getPolicyById = async (policyId) => {
  try {
    const policy = await SecurityPolicy.findOne({
      where: {
        [Op.or]: [
          { id: policyId },
          { SEC_PLCY_ID: policyId }
        ]
      }
    });
    
    return policy;
  } catch (error) {
    console.error('Error getting security policy by ID:', error.message);
    throw error;
  }
};

SecurityPolicy.updatePolicy = async (policyId, updateData, userId) => {
  try {
    const policy = await SecurityPolicy.getPolicyById(policyId);
    
    if (!policy) {
      throw new Error('Security policy not found');
    }
    
    // Increment version number
    updateData.VERSION_NO = policy.VERSION_NO + 1;
    
    // Set updated by fields
    updateData.updated_by_user = userId;
    updateData.ROW_TS = new Date();
    
    await policy.update(updateData);
    
    return policy;
  } catch (error) {
    console.error('Error updating security policy:', error.message);
    throw error;
  }
};

SecurityPolicy.deactivatePolicy = async (policyId, userId) => {
  try {
    const policy = await SecurityPolicy.getPolicyById(policyId);
    
    if (!policy) {
      throw new Error('Security policy not found');
    }
    
    await policy.update({
      status: 'inactive',
      REC_ST: 'INACTIVE',
      updated_by_user: userId,
      ROW_TS: new Date()
    });
    
    return policy;
  } catch (error) {
    console.error('Error deactivating security policy:', error.message);
    throw error;
  }
};

SecurityPolicy.activatePolicy = async (policyId, userId) => {
  try {
    const policy = await SecurityPolicy.getPolicyById(policyId);
    
    if (!policy) {
      throw new Error('Security policy not found');
    }
    
    // Deactivate all other active policies first
    await SecurityPolicy.update(
      {
        status: 'inactive',
        REC_ST: 'INACTIVE',
        updated_by_user: userId,
        ROW_TS: new Date()
      },
      {
        where: {
          status: 'active',
          id: { [Op.ne]: policy.id }
        }
      }
    );
    
    // Activate this policy
    await policy.update({
      status: 'active',
      REC_ST: 'ACTIVE',
      updated_by_user: userId,
      ROW_TS: new Date()
    });
    
    return policy;
  } catch (error) {
    console.error('Error activating security policy:', error.message);
    throw error;
  }
};

SecurityPolicy.getAllPolicies = async (filters = {}) => {
  try {
    const whereClause = {};
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.search) {
      whereClause[Op.or] = [
        { policy_name: { [Op.like]: `%${filters.search}%` } },
        { SEC_PLCY_ID: { [Op.like]: `%${filters.search}%` } },
        { description: { [Op.like]: `%${filters.search}%` } }
      ];
    }
    
    const policies = await SecurityPolicy.findAll({
      where: whereClause,
      order: [['VERSION_NO', 'DESC'], ['created_at', 'DESC']]
    });
    
    return policies;
  } catch (error) {
    console.error('Error getting all security policies:', error.message);
    throw error;
  }
};

SecurityPolicy.getPolicyStats = async () => {
  try {
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_policies,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_policies,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_policies,
        MAX(version_no) as highest_version,
        MIN(created_at) as oldest_policy_date,
        MAX(created_at) as newest_policy_date
      FROM security_policies
    `);
    
    return stats[0];
  } catch (error) {
    console.error('Error getting security policy stats:', error.message);
    throw error;
  }
};

SecurityPolicy.validatePassword = async (password) => {
  try {
    const activePolicy = await SecurityPolicy.getActivePolicy();
    
    if (!activePolicy) {
      return { isValid: true, errors: [] }; // No active policy, allow any password
    }
    
    const errors = [];
    
    // Check minimum length
    if (password.length < activePolicy.PASSWD_MIN_LENGTH) {
      errors.push(`Password must be at least ${activePolicy.PASSWD_MIN_LENGTH} characters long`);
    }
    
    // Check maximum length
    if (password.length > activePolicy.PASSWD_MAX_LENGTH) {
      errors.push(`Password cannot exceed ${activePolicy.PASSWD_MAX_LENGTH} characters`);
    }
    
    // Check for special characters if enforced
    if (activePolicy.ENFORCE_SPEC_CHAR_FG) {
      const specialChars = /[!@#$%^&*(),.?":{}|<>]/;
      if (!specialChars.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    }
    
    // Check for numeric characters if enforced
    if (activePolicy.ENFORCE_NUMERIC_CHAR_FG) {
      const numbers = /[0-9]/;
      if (!numbers.test(password)) {
        errors.push('Password must contain at least one number');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : null,
      policy: activePolicy
    };
  } catch (error) {
    console.error('Error validating password:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
SecurityPolicy.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS security_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sec_plcy_id VARCHAR(50) UNIQUE NOT NULL,
        policy_name VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        enforce_bio_verification BOOLEAN DEFAULT false,
        grace_login_period INT DEFAULT 0,
        max_failed_login_attempts INT DEFAULT 5,
        prevent_password_reuse BOOLEAN DEFAULT false,
        password_change_freq INT DEFAULT 30,
        password_min_length INT DEFAULT 8,
        password_max_length INT DEFAULT 64,
        enforce_selected_charset BOOLEAN DEFAULT false,
        selected_characterset VARCHAR(100),
        enforce_special_char BOOLEAN DEFAULT false,
        special_char_position_code VARCHAR(20),
        mandatory_char_position_code VARCHAR(20),
        special_char_position VARCHAR(100),
        enforce_numeric_char BOOLEAN DEFAULT false,
        numeric_char_position VARCHAR(100),
        enforce_mandatory_char BOOLEAN DEFAULT false,
        record_state VARCHAR(20) DEFAULT 'ACTIVE',
        version_no INT DEFAULT 1,
        row_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id VARCHAR(50) NOT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(50) NOT NULL,
        sys_create_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        password_exp_notification INT DEFAULT 7,
        suspend_user_after_days INT DEFAULT 30,
        user_activate_bu_proc_id VARCHAR(50),
        user_removal_bu_proc_id VARCHAR(50),
        user_modify_bu_proc_id VARCHAR(50),
        user_role_activate_bu_proc_id VARCHAR(50),
        user_role_deact_bu_proc_id VARCHAR(50),
        user_role_modify_bu_proc_id VARCHAR(50),
        user_role_addition_bu_proc_id VARCHAR(50),
        password_reuse_option ENUM('none', 'last_3', 'last_5', 'last_10', 'all') DEFAULT 'none',
        user_deactivate_bu_proc_id VARCHAR(50),
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by_user INT NOT NULL,
        updated_by_user INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sec_plcy_id (sec_plcy_id),
        INDEX idx_policy_name (policy_name),
        INDEX idx_status (status),
        INDEX idx_created_by_user (created_by_user),
        INDEX idx_version_no (version_no),
        CONSTRAINT fk_security_policy_created_by FOREIGN KEY (created_by_user) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_security_policy_updated_by FOREIGN KEY (updated_by_user) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Security policies table initialized');
    
    // Create a default policy if none exists
    const existingCount = await SecurityPolicy.count();
    if (existingCount === 0) {
      await SecurityPolicy.create({
        SEC_PLCY_ID: 'SECPOL-DEFAULT-001',
        policy_name: 'Default Security Policy',
        description: 'Default security policy for the banking system',
        ENFORCE_BIO_VRFCTN_FG: false,
        MAX_FAILED_LOGIN_ATTEMPTS: 5,
        PREVENT_PASSWD_REUSE_FG: true,
        PASSWD_CHANGE_FREQ: 90,
        PASSWD_MIN_LENGTH: 8,
        PASSWD_MAX_LENGTH: 64,
        ENFORCE_SPEC_CHAR_FG: true,
        ENFORCE_NUMERIC_CHAR_FG: true,
        PASSWD_EXP_NOTIFICATION: 7,
        SUSPEND_USER_AFTER_DAYS: 30,
        PWD_REUSE_OPT: 'last_5',
        USER_ID: 'system',
        CREATED_BY: 'system',
        created_by_user: 1 // Assuming system user has ID 1
      });
      console.log('✅ Default security policy created');
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing security policies table:', error.message);
    return false;
  }
};

// Sync the model (creates table if it doesn't exist)
SecurityPolicy.syncTable = async () => {
  try {
    await SecurityPolicy.sync({ alter: false });
    console.log('✅ SecurityPolicy table synced');
    return true;
  } catch (error) {
    console.error('Error syncing SecurityPolicy table:', error.message);
    return false;
  }
};

export default SecurityPolicy;
