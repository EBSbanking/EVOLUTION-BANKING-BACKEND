// models/Permissions.js
import { DataTypes, Model, Op } from 'sequelize'; // Import Op from sequelize
import sequelize from '../../config/db.js';

// You'll need to import your permissions constants
// import { PERMISSIONS } from '../constants/permissions.js';

class Permissions extends Model {
  // Static method: Find permission by role ID
  static async findByRoleId(roleId, options = {}) {
    return this.findOne({
      where: { BU_ROLE_ID: roleId },
      ...options
    });
  }

  // Static method: Find active permissions
  static async findActivePermissions(options = {}) {
    const defaultOptions = {
      where: { IS_ACTIVE: true },
      order: [['ROLE_NAME', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find permissions by name
  static async findByRoleName(roleName, options = {}) {
    const defaultOptions = {
      where: {
        ROLE_NAME: {
          [Op.iLike]: `%${roleName}%` // Use Op instead of sequelize.Op
        }
      },
      order: [['ROLE_NAME', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Check if user has specific permission
  static async hasPermission(roleId, permissionCategory, permission) {
    const permissionRecord = await this.findByRoleId(roleId);
    
    if (!permissionRecord || !permissionRecord.IS_ACTIVE) {
      return false;
    }

    const accessLevelField = `${permissionCategory.toUpperCase()}_ACCESS_LEVEL`;
    const permissionsArray = permissionRecord[accessLevelField];
    
    if (!permissionsArray || !Array.isArray(permissionsArray)) {
      return false;
    }

    return permissionsArray.includes(permission);
  }

  // Static method: Get permission summary
  static async getPermissionSummary() {
    const results = await this.findAll({
      attributes: [
        'BU_ROLE_ID',
        'ROLE_NAME',
        'IS_ACTIVE',
        [sequelize.fn('COUNT', sequelize.col('BU_ROLE_ID')), 'totalPermissions']
      ],
      group: ['BU_ROLE_ID', 'ROLE_NAME', 'IS_ACTIVE'],
      order: [['ROLE_NAME', 'ASC']],
      raw: true
    });

    return results.map(result => ({
      roleId: result.BU_ROLE_ID,
      roleName: result.ROLE_NAME,
      isActive: result.IS_ACTIVE,
      totalPermissions: parseInt(result.totalPermissions) || 0
    }));
  }

  // Static method: Create role with permissions
  static async createRole(roleData, permissions = {}) {
    const transaction = await sequelize.transaction();
    
    try {
      // Prepare permissions data
      const permissionFields = {};
      const permissionCategories = [
        'DRAWER', 'CUSTOMER', 'ACCOUNT', 'TRANSACTION', 'DASHBOARD',
        'REPORT', 'THRIFT', 'LOAN_OPERATIONS', 'LOAN_FEE', 'POSTING',
        'FIXED_ASSET', 'SYSTEM_ADMIN', 'PERMISSION_MANAGEMENT', 'CREDIT_APPL',
        'APPROVAL', 'TREASURY', 'OPERATIONS', 'WORKFLOW', 'AML',
        'BUSINESS_UNIT', 'SECURITY_PROFILE', 'DEPOSIT', 'GUARANTOR',
        'RATE', 'PRODUCT', 'HOLIDAY', 'MARKETING', 'AGENCY',
        'ANALYTICS', 'RISK', 'RECONCILIATION', 'PERFORMANCE', 'STATISTICS'
      ];

      // Map permissions to fields
      permissionCategories.forEach(category => {
        const fieldName = `${category}_ACCESS_LEVEL`;
        permissionFields[fieldName] = permissions[category.toLowerCase()] || [];
      });

      // Create the role
      const role = await this.create({
        BU_ROLE_ID: roleData.BU_ROLE_ID,
        ROLE_NAME: roleData.ROLE_NAME,
        DESCRIPTION: roleData.DESCRIPTION,
        IS_ACTIVE: roleData.IS_ACTIVE !== undefined ? roleData.IS_ACTIVE : true,
        ...permissionFields
      }, { transaction });

      await transaction.commit();
      return role;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method: Update role permissions
  static async updateRolePermissions(roleId, permissions = {}) {
    const role = await this.findByRoleId(roleId);
    
    if (!role) {
      throw new Error('Role not found');
    }

    const permissionFields = {};
    const permissionCategories = [
      'DRAWER', 'CUSTOMER', 'ACCOUNT', 'TRANSACTION', 'DASHBOARD',
      'REPORT', 'THRIFT', 'LOAN_OPERATIONS', 'LOAN_FEE', 'POSTING',
      'FIXED_ASSET', 'SYSTEM_ADMIN', 'PERMISSION_MANAGEMENT', 'CREDIT_APPL',
      'APPROVAL', 'TREASURY', 'OPERATIONS', 'WORKFLOW', 'AML',
      'BUSINESS_UNIT', 'SECURITY_PROFILE', 'DEPOSIT', 'GUARANTOR',
      'RATE', 'PRODUCT', 'HOLIDAY', 'MARKETING', 'AGENCY',
      'ANALYTICS', 'RISK', 'RECONCILIATION', 'PERFORMANCE', 'STATISTICS'
    ];

    // Only update provided permission categories
    permissionCategories.forEach(category => {
      const fieldName = `${category}_ACCESS_LEVEL`;
      const permissionKey = category.toLowerCase();
      
      if (permissions[permissionKey] !== undefined) {
        permissionFields[fieldName] = permissions[permissionKey];
      }
    });

    return role.update(permissionFields);
  }

  // Instance method: Get formatted permissions
  getFormattedPermissions() {
    return {
      roleId: this.BU_ROLE_ID,
      roleName: this.ROLE_NAME,
      description: this.DESCRIPTION,
      isActive: this.IS_ACTIVE,
      permissions: {
        drawer: this.DRAWER_ACCESS_LEVEL || [],
        customer: this.CUSTOMER_ACCESS_LEVEL || [],
        account: this.ACCOUNT_ACCESS_LEVEL || [],
        transaction: this.TRANSACTION_ACCESS_LEVEL || [],
        dashboard: this.DASHBOARD_ACCESS_LEVEL || [],
        report: this.REPORT_ACCESS_LEVEL || [],
        thrift: this.THRIFT_ACCESS_LEVEL || [],
        loanOperations: this.LOAN_OPERATIONS_ACCESS_LEVEL || [],
        loanFee: this.LOAN_FEE_ACCESS_LEVEL || [],
        posting: this.POSTING_ACCESS_LEVEL || [],
        fixedAsset: this.FIXED_ASSET_ACCESS_LEVEL || [],
        systemAdmin: this.SYSTEM_ADMIN_ACCESS_LEVEL || [],
        permissionManagement: this.PERMISSION_MANAGEMENT_ACCESS_LEVEL || [],
        creditApplication: this.CREDIT_APPL_ACCESS_LEVEL || [],
        approval: this.APPROVAL_ACCESS_LEVEL || [],
        treasury: this.TREASURY_ACCESS_LEVEL || [],
        operations: this.OPERATIONS_ACCESS_LEVEL || [],
        workflow: this.WORKFLOW_ACCESS_LEVEL || [],
        aml: this.AML_ACCESS_LEVEL || [],
        businessUnit: this.BUSINESS_UNIT_ACCESS_LEVEL || [],
        securityProfile: this.SECURITY_PROFILE_ACCESS_LEVEL || [],
        deposit: this.DEPOSIT_ACCESS_LEVEL || [],
        guarantor: this.GUARANTOR_ACCESS_LEVEL || [],
        rate: this.RATE_ACCESS_LEVEL || [],
        product: this.PRODUCT_ACCESS_LEVEL || [],
        holiday: this.HOLIDAY_ACCESS_LEVEL || [],
        marketing: this.MARKETING_ACCESS_LEVEL || [],
        agency: this.AGENCY_ACCESS_LEVEL || [],
        analytics: this.ANALYTICS_ACCESS_LEVEL || [],
        risk: this.RISK_ACCESS_LEVEL || [],
        reconciliation: this.RECONCILIATION_ACCESS_LEVEL || [],
        performance: this.PERFORMANCE_ACCESS_LEVEL || [],
        statistics: this.STATISTICS_ACCESS_LEVEL || []
      }
    };
  }

  // Instance method: Check if has specific permission
  hasPermission(permissionCategory, permission) {
    const accessLevelField = `${permissionCategory.toUpperCase()}_ACCESS_LEVEL`;
    const permissionsArray = this[accessLevelField];
    
    if (!permissionsArray || !Array.isArray(permissionsArray)) {
      return false;
    }

    return permissionsArray.includes(permission);
  }

  // Instance method: Add permission to category
  addPermission(permissionCategory, permission) {
    const accessLevelField = `${permissionCategory.toUpperCase()}_ACCESS_LEVEL`;
    let permissionsArray = this[accessLevelField] || [];
    
    if (!Array.isArray(permissionsArray)) {
      permissionsArray = [];
    }
    
    if (!permissionsArray.includes(permission)) {
      permissionsArray.push(permission);
      this[accessLevelField] = permissionsArray;
    }
    
    return this;
  }

  // Instance method: Remove permission from category
  removePermission(permissionCategory, permission) {
    const accessLevelField = `${permissionCategory.toUpperCase()}_ACCESS_LEVEL`;
    let permissionsArray = this[accessLevelField] || [];
    
    if (Array.isArray(permissionsArray)) {
      this[accessLevelField] = permissionsArray.filter(p => p !== permission);
    }
    
    return this;
  }

  // Instance method: Check if has any permissions in category
  hasAnyPermissionInCategory(permissionCategory) {
    const accessLevelField = `${permissionCategory.toUpperCase()}_ACCESS_LEVEL`;
    const permissionsArray = this[accessLevelField];
    
    return permissionsArray && Array.isArray(permissionsArray) && permissionsArray.length > 0;
  }

  // Instance method: Get all permissions as flat array
  getAllPermissions() {
    const permissionCategories = [
      'DRAWER', 'CUSTOMER', 'ACCOUNT', 'TRANSACTION', 'DASHBOARD',
      'REPORT', 'THRIFT', 'LOAN_OPERATIONS', 'LOAN_FEE', 'POSTING',
      'FIXED_ASSET', 'SYSTEM_ADMIN', 'PERMISSION_MANAGEMENT', 'CREDIT_APPL',
      'APPROVAL', 'TREASURY', 'OPERATIONS', 'WORKFLOW', 'AML',
      'BUSINESS_UNIT', 'SECURITY_PROFILE', 'DEPOSIT', 'GUARANTOR',
      'RATE', 'PRODUCT', 'HOLIDAY', 'MARKETING', 'AGENCY',
      'ANALYTICS', 'RISK', 'RECONCILIATION', 'PERFORMANCE', 'STATISTICS'
    ];

    const allPermissions = [];
    
    permissionCategories.forEach(category => {
      const fieldName = `${category}_ACCESS_LEVEL`;
      const permissionsArray = this[fieldName];
      
      if (permissionsArray && Array.isArray(permissionsArray)) {
        allPermissions.push(...permissionsArray.map(perm => ({
          permission: perm,
          category: category.toLowerCase()
        })));
      }
    });

    return allPermissions;
  }

  // Instance method: Get total permission count
  getPermissionCount() {
    const formatted = this.getFormattedPermissions();
    let count = 0;
    
    Object.values(formatted.permissions).forEach(permissionArray => {
      if (Array.isArray(permissionArray)) {
        count += permissionArray.length;
      }
    });
    
    return count;
  }

  // Virtual getter: Is active role?
  get isActiveRole() {
    return this.IS_ACTIVE === true;
  }

  // Virtual getter: Permission summary
  get permissionSummary() {
    const formatted = this.getFormattedPermissions();
    const summary = {
      roleId: this.BU_ROLE_ID,
      roleName: this.ROLE_NAME,
      isActive: this.IS_ACTIVE,
      totalPermissions: 0,
      categoriesWithPermissions: 0,
      categories: {}
    };

    Object.entries(formatted.permissions).forEach(([category, permissions]) => {
      if (Array.isArray(permissions) && permissions.length > 0) {
        summary.categoriesWithPermissions++;
        summary.totalPermissions += permissions.length;
        summary.categories[category] = {
          count: permissions.length,
          permissions: permissions
        };
      }
    });

    return summary;
  }

  // Virtual getter: Formatted role display
  get roleDisplay() {
    return `${this.BU_ROLE_ID} - ${this.ROLE_NAME}${this.IS_ACTIVE ? '' : ' (Inactive)'}`;
  }

  // Virtual getter: Has admin permissions?
  get hasAdminPermissions() {
    return this.hasAnyPermissionInCategory('SYSTEM_ADMIN') || 
           this.hasAnyPermissionInCategory('PERMISSION_MANAGEMENT');
  }

  // Virtual getter: Has financial permissions?
  get hasFinancialPermissions() {
    return this.hasAnyPermissionInCategory('TRANSACTION') || 
           this.hasAnyPermissionInCategory('POSTING') ||
           this.hasAnyPermissionInCategory('TREASURY');
  }

  // Virtual getter: Has customer management permissions?
  get hasCustomerManagementPermissions() {
    return this.hasAnyPermissionInCategory('CUSTOMER') || 
           this.hasAnyPermissionInCategory('ACCOUNT') ||
           this.hasAnyPermissionInCategory('DEPOSIT');
  }
}

Permissions.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },

  BU_ROLE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Business unit role identifier'
  },

  ROLE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Role name'
  },

  DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Role description'
  },

  IS_ACTIVE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Is role active?'
  },

  // Permission arrays stored as JSON
  DRAWER_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Drawer access permissions'
  },

  CUSTOMER_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Customer access permissions'
  },

  ACCOUNT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Account access permissions'
  },

  TRANSACTION_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Transaction access permissions'
  },

  DASHBOARD_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Dashboard access permissions'
  },

  REPORT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Report access permissions'
  },

  THRIFT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Thrift access permissions'
  },

  LOAN_OPERATIONS_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Loan operations access permissions'
  },

  LOAN_FEE_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Loan fee access permissions'
  },

  POSTING_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Posting access permissions'
  },

  FIXED_ASSET_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Fixed asset access permissions'
  },

  SYSTEM_ADMIN_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'System admin access permissions'
  },

  PERMISSION_MANAGEMENT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Permission management access permissions'
  },

  CREDIT_APPL_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Credit application access permissions'
  },

  APPROVAL_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Approval access permissions'
  },

  TREASURY_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Treasury access permissions'
  },

  OPERATIONS_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Operations access permissions'
  },

  WORKFLOW_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Workflow access permissions'
  },

  AML_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'AML access permissions'
  },

  BUSINESS_UNIT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Business unit access permissions'
  },

  SECURITY_PROFILE_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Security profile access permissions'
  },

  DEPOSIT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Deposit access permissions'
  },

  GUARANTOR_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Guarantor access permissions'
  },

  RATE_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Rate access permissions'
  },

  PRODUCT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Product access permissions'
  },

  HOLIDAY_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Holiday access permissions'
  },

  MARKETING_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Marketing access permissions'
  },

  AGENCY_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Agency access permissions'
  },

  ANALYTICS_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Analytics access permissions'
  },

  RISK_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Risk access permissions'
  },

  RECONCILIATION_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Reconciliation access permissions'
  },

  PERFORMANCE_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Performance access permissions'
  },

  STATISTICS_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Statistics access permissions'
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Permissions',
  tableName: 'permissions',
  timestamps: true,
  hooks: {
    beforeValidate: (permission) => {
      // Trim string fields
      if (permission.ROLE_NAME) permission.ROLE_NAME = permission.ROLE_NAME.trim();
      if (permission.DESCRIPTION) permission.DESCRIPTION = permission.DESCRIPTION.trim();
      
      // Ensure all JSON fields are arrays
      const jsonFields = [
        'DRAWER_ACCESS_LEVEL', 'CUSTOMER_ACCESS_LEVEL', 'ACCOUNT_ACCESS_LEVEL',
        'TRANSACTION_ACCESS_LEVEL', 'DASHBOARD_ACCESS_LEVEL', 'REPORT_ACCESS_LEVEL',
        'THRIFT_ACCESS_LEVEL', 'LOAN_OPERATIONS_ACCESS_LEVEL', 'LOAN_FEE_ACCESS_LEVEL',
        'POSTING_ACCESS_LEVEL', 'FIXED_ASSET_ACCESS_LEVEL', 'SYSTEM_ADMIN_ACCESS_LEVEL',
        'PERMISSION_MANAGEMENT_ACCESS_LEVEL', 'CREDIT_APPL_ACCESS_LEVEL', 'APPROVAL_ACCESS_LEVEL',
        'TREASURY_ACCESS_LEVEL', 'OPERATIONS_ACCESS_LEVEL', 'WORKFLOW_ACCESS_LEVEL',
        'AML_ACCESS_LEVEL', 'BUSINESS_UNIT_ACCESS_LEVEL', 'SECURITY_PROFILE_ACCESS_LEVEL',
        'DEPOSIT_ACCESS_LEVEL', 'GUARANTOR_ACCESS_LEVEL', 'RATE_ACCESS_LEVEL',
        'PRODUCT_ACCESS_LEVEL', 'HOLIDAY_ACCESS_LEVEL', 'MARKETING_ACCESS_LEVEL',
        'AGENCY_ACCESS_LEVEL', 'ANALYTICS_ACCESS_LEVEL', 'RISK_ACCESS_LEVEL',
        'RECONCILIATION_ACCESS_LEVEL', 'PERFORMANCE_ACCESS_LEVEL', 'STATISTICS_ACCESS_LEVEL'
      ];

      jsonFields.forEach(field => {
        if (permission[field] && !Array.isArray(permission[field])) {
          // Try to parse if it's a JSON string
          try {
            if (typeof permission[field] === 'string') {
              permission[field] = JSON.parse(permission[field]);
            }
          } catch (error) {
            permission[field] = [];
          }
        }
        
        // Ensure it's an array
        if (!permission[field] || !Array.isArray(permission[field])) {
          permission[field] = [];
        }
        
        // Remove duplicates and sort
        if (Array.isArray(permission[field])) {
          permission[field] = [...new Set(permission[field])].sort();
        }
      });
    },
    
    beforeCreate: (permission) => {
      // Validate that BU_ROLE_ID is unique
      return Permissions.findOne({
        where: { BU_ROLE_ID: permission.BU_ROLE_ID }
      }).then(existingPermission => {
        if (existingPermission) {
          throw new Error(`BU_ROLE_ID ${permission.BU_ROLE_ID} already exists`);
        }
      });
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['id'] },
    { fields: ['BU_ROLE_ID'], unique: true },
    
    // Role name index
    { fields: ['ROLE_NAME'] },
    
    // Status index
    { fields: ['IS_ACTIVE'] },
    
    // Composite indexes for common queries
    { fields: ['BU_ROLE_ID', 'IS_ACTIVE'] },
    { fields: ['ROLE_NAME', 'IS_ACTIVE'] },
    
    // Full-text search on role name and description
    // { fields: ['ROLE_NAME', 'DESCRIPTION'], type: 'FULLTEXT' }
  ],
  scopes: {
    active: {
      where: { IS_ACTIVE: true }
    },
    inactive: {
      where: { IS_ACTIVE: false }
    },
    byRoleId: (roleId) => ({
      where: { BU_ROLE_ID: roleId }
    }),
    byRoleName: (roleName) => ({
      where: {
        ROLE_NAME: {
          [Op.iLike]: `%${roleName}%` // Use Op instead of sequelize.Op
        }
      }
    }),
    withAdminPermissions: {
      where: {
        [Op.or]: [ // Use Op instead of sequelize.Op
          { SYSTEM_ADMIN_ACCESS_LEVEL: { [Op.ne]: null } },
          { PERMISSION_MANAGEMENT_ACCESS_LEVEL: { [Op.ne]: null } }
        ]
      }
    },
    withCustomerPermissions: {
      where: {
        [Op.or]: [
          { CUSTOMER_ACCESS_LEVEL: { [Op.ne]: null } },
          { ACCOUNT_ACCESS_LEVEL: { [Op.ne]: null } }
        ]
      }
    },
    withTransactionPermissions: {
      where: {
        TRANSACTION_ACCESS_LEVEL: { [Op.ne]: null } // Use Op instead of sequelize.Op
      }
    },
    sortedByName: {
      order: [['ROLE_NAME', 'ASC']]
    },
    sortedById: {
      order: [['BU_ROLE_ID', 'ASC']]
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default Permissions;

