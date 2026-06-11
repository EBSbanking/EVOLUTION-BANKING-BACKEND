// models/Group.js - Updated Sequelize Model for Group with default scope to exclude group_id

import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js'; // Adjust path as needed

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // New fields
  groupCode: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [1, 50]
    },
    set(value) {
      this.setDataValue('groupCode', value.trim().toUpperCase());
    }
  },
  groupName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255]
    },
    set(value) {
      this.setDataValue('groupName', value.trim());
    }
  },
  members: {
    type: DataTypes.JSON, // Store as JSON array of customer CUST_IDs
    defaultValue: [],
    validate: {
      isArray(value) {
        if (!Array.isArray(value)) {
          throw new Error('Members must be an array');
        }
      }
    },
    comment: 'Array of customer CUST_IDs belonging to this group'
  },
  memberCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'dissolved'),
    defaultValue: 'active'
  },
  
  // Legacy fields (preserved for migration)
  legacyId: {
    type: DataTypes.INTEGER,
    unique: true,
    allowNull: true
  },
  branch: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      notNull: true,
      isInt: true
    }
  },
  relationshipManager: {
    type: DataTypes.STRING,  // Changed to STRING to accept values like "PCO04"
    allowNull: true,
    field: 'relationship_manager' // Explicitly map to snake_case column
  },
  
  regDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'reg_date' // Explicitly map to snake_case column
  },
  minMembers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    },
    field: 'min_members' // Explicitly map to snake_case column
  },
  maxMembers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    },
    field: 'max_members' // Explicitly map to snake_case column
  },
  meetingDay: {
    type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    allowNull: true,
    field: 'meeting_day' // Explicitly map to snake_case column
  },
  meetingFrequency: {
    type: DataTypes.ENUM('Once Every Week', 'Once Every Two Weeks', 'Once Every Month'),
    allowNull: true,
    field: 'meeting_frequency' // Explicitly map to snake_case column
  },
  unionAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 500]
    },
    field: 'union_address', // Explicitly map to snake_case column
    set(value) {
      if (value) {
        this.setDataValue('unionAddress', value.trim());
      }
    }
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      notNull: true,
      isInt: true
    },
    field: 'created_by' // Explicitly map to snake_case column
  },
  offlineId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    field: 'offline_id' // Explicitly map to snake_case column
  },
  groupType: {
    type: DataTypes.ENUM('Union', 'Association', 'Cooperative', 'Other'),
    defaultValue: 'Union',
    field: 'group_type' // Explicitly map to snake_case column
  },
  // CHANGED: from INTEGER to BIGINT to support 10-digit account numbers
  unionPurseAccount: {
    type: DataTypes.BIGINT,  // Changed from INTEGER to BIGINT
    defaultValue: 0,
    validate: {
      min: 0,
      // Custom validator to ensure 10 digits
      isTenDigits(value) {
        if (value && value.toString().length > 10) {
          throw new Error('Union purse account must be at most 10 digits');
        }
      }
    },
    field: 'union_purse_account', // Explicitly map to snake_case column
    comment: '10-digit account number for union purse funds (Format: YYDDD + 5-digit sequence)'
  },
  migrationId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    field: 'migration_id' // Explicitly map to snake_case column
  },
  
  // Migration reference fields
  mysqlId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'mysql_id' // Explicitly map to snake_case column
  },
  originalData: {
    type: DataTypes.JSON, // Store original data as JSON
    allowNull: true,
    defaultValue: null,
    field: 'original_data' // Explicitly map to snake_case column
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at' // Explicitly map to snake_case column
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at' // Explicitly map to snake_case column
  }
}, {
  tableName: 'Groups',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
   
  // ========== ADDED DEFAULT SCOPE TO EXCLUDE group_id ==========
  defaultScope: {
    attributes: {
      exclude: ['group_id'] // Ensure we never try to select non-existent group_id column
    }
  },
  // =============================================================
  
  // Optional: Add a scope that includes all fields if needed
  scopes: {
    withAllFields: {
      attributes: {}
    }
  },
  
  hooks: {
    beforeSave: (group, options) => {
      // Update memberCount based on members array length
      if (Array.isArray(group.members)) {
        group.memberCount = group.members.length;
      } else {
        group.memberCount = 0;
        group.members = [];
      }
    },
    beforeUpdate: (group, options) => {
      // Update memberCount if members array is being updated
      if (group.changed('members')) {
        if (Array.isArray(group.members)) {
          group.memberCount = group.members.length;
        } else {
          group.memberCount = 0;
          group.members = [];
        }
      }
    },
    afterCreate: async (group, options) => {
      // Note: This hook doesn't update customer records
      // Customer records are updated in the GroupController
      console.log(`✅ Group created: ${group.groupCode} with ${group.memberCount} members`);
    }
  },
 
});

// Instance methods
Group.prototype.canAddMember = function() {
  if (this.maxMembers === 0) return true; // No limit
  return this.memberCount < this.maxMembers;
};

Group.prototype.addMember = async function(customerId) {
  if (!this.members.includes(customerId)) {
    const members = [...this.members, customerId];
    return this.update({ members });
  }
  return this;
};

Group.prototype.removeMember = async function(customerId) {
  const members = this.members.filter(member => member !== customerId);
  return this.update({ members });
};

Group.prototype.getDisplayName = function() {
  return `${this.groupCode} - ${this.groupName}`;
};

// Class methods (static methods)
Group.findActiveByBranch = function(branchId) {
  return Group.findAll({
    where: {
      branch: branchId,
      status: 'active'
    }
  });
};

Group.findByLegacyId = function(legacyId) {
  return Group.findOne({
    where: {
      legacyId: Number(legacyId)
    }
  });
};

Group.findByMysqlId = function(mysqlId) {
  return Group.findOne({
    where: {
      mysqlId: Number(mysqlId)
    }
  });
};

Group.findByGroupCode = function(groupCode) {
  return Group.findOne({
    where: {
      groupCode: groupCode.toUpperCase()
    }
  });
};

// Virtual property (getter)
Object.defineProperty(Group.prototype, 'displayName', {
  get: function() {
    return `${this.groupCode} - ${this.groupName}`;
  }
});

export default Group;