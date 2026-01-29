// models/Group.js - Updated Sequelize Model for Group
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
    type: DataTypes.JSON, // Store as JSON array
    defaultValue: [],
    validate: {
      isArray(value) {
        if (!Array.isArray(value)) {
          throw new Error('Members must be an array');
        }
      }
    }
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
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      notNull: true,
      isInt: true
    }
  },
  regDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  minMembers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  maxMembers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  meetingDay: {
    type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
    allowNull: true
  },
  meetingFrequency: {
    type: DataTypes.ENUM('Once Every Week', 'Once Every Two Weeks', 'Once Every Month'),
    allowNull: true
  },
  unionAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [0, 500]
    },
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
    }
  },
  offlineId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  groupType: {
    type: DataTypes.ENUM('Union', 'Association', 'Cooperative', 'Other'),
    defaultValue: 'Union'
  },
  unionPurseAccount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  migrationId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  
  // Migration reference fields
  mysqlId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  originalData: {
    type: DataTypes.JSON, // Store original data as JSON
    allowNull: true,
    defaultValue: null
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Groups',
  timestamps: true, // Use Sequelize's automatic timestamps
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
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
    }
  },
  indexes: [
    {
      name: 'idx_group_code',
      fields: ['groupCode'],
      unique: true
    },
    {
      name: 'idx_group_name',
      fields: ['groupName']
    },
    {
      name: 'idx_branch',
      fields: ['branch']
    },
    {
      name: 'idx_relationship_manager',
      fields: ['relationshipManager']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_legacy_id',
      fields: ['legacyId'],
      unique: true
    },
    {
      name: 'idx_mysql_id',
      fields: ['mysqlId']
    },
    // Full-text index equivalent (if needed, depends on database)
    {
      name: 'idx_group_name_text',
      fields: ['groupName'],
      using: 'BTREE' // Use GIN/GIST for full-text in PostgreSQL
    }
  ]
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