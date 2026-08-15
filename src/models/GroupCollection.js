// models/GroupCollection.js - Schema for Group Loan Collection Record
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const GroupCollection = sequelize.define('GroupCollection', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Groups', // Reference to Group model
      key: 'id'
    }
  },
  groupLoanId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'GroupLoans', // Reference to GroupLoan model
      key: 'id'
    }
  },
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users', // Reference to User model
      key: 'id'
    }
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Branches', // Reference to Branch model
      key: 'id'
    }
  },
  relationshipManagerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users', // Reference to User model (for RM)
      key: 'id'
    }
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true,
      notNull: true
    }
  },
  total: {
    type: DataTypes.DECIMAL(15, 2), // For precise monetary values
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  status: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
    defaultValue: 'Pending'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
    validate: {
      len: [3, 3],
      isUppercase: true
    },
    set(value) {
      if (value) {
        this.setDataValue('currency', value.toUpperCase().trim());
      }
    }
  },
  lastUpdated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  offlineId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
  },
  channel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isInt: true,
      min: 1
    }
  },
  legacyId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    validate: {
      isInt: true
    }
  }
}, {
  tableName: 'GroupCollections',
  timestamps: true, // Creates createdAt and updatedAt automatically
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeSave: (collection, options) => {
      // Update lastUpdated on save
      collection.lastUpdated = new Date();
    },
    beforeUpdate: (collection, options) => {
      // Update lastUpdated on update
      collection.lastUpdated = new Date();
    }
  },
  indexes: [
    {
      name: 'idx_group_id',
      fields: ['groupId']
    },
    {
      name: 'idx_group_loan_id',
      fields: ['groupLoanId']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_date',
      fields: ['date'],
      order: [['date', 'DESC']]
    },
    {
      name: 'idx_branch_id',
      fields: ['branchId']
    },
    {
      name: 'idx_legacy_id',
      fields: ['legacyId'],
      unique: true
    },
    // Composite indexes for common queries
    {
      name: 'idx_group_loan_status',
      fields: ['groupLoanId', 'status']
    },
    {
      name: 'idx_group_date_status',
      fields: ['groupId', 'date', 'status']
    },
    {
      name: 'idx_created_by_date',
      fields: ['createdById', 'date']
    }
  ]
});

// Instance methods
GroupCollection.prototype.isLatest = async function() {
  // Check if this is the most recent collection for the group loan
  const latestCollection = await GroupCollection.findOne({
    where: {
      groupLoanId: this.groupLoanId
    },
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit: 1
  });
  
  return latestCollection && latestCollection.id === this.id;
};

GroupCollection.prototype.getSummary = function() {
  return {
    id: this.id,
    groupId: this.groupId,
    groupLoanId: this.groupLoanId,
    date: this.date,
    total: parseFloat(this.total),
    status: this.status,
    currency: this.currency
  };
};

// Class methods (static methods)
GroupCollection.findByGroupLoan = function(groupLoanId, options = {}) {
  const where = { groupLoanId };
  
  if (options.status) {
    where.status = options.status;
  }
  
  if (options.dateRange) {
    where.date = {
      [Op.between]: [options.dateRange.start, options.dateRange.end]
    };
  }
  
  return GroupCollection.findAll({
    where,
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit: options.limit || 100
  });
};

GroupCollection.findByGroup = function(groupId, options = {}) {
  const where = { groupId };
  
  if (options.status) {
    where.status = options.status;
  }
  
  if (options.dateRange) {
    where.date = {
      [Op.between]: [options.dateRange.start, options.dateRange.end]
    };
  }
  
  return GroupCollection.findAll({
    where,
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit: options.limit || 100
  });
};

GroupCollection.getTotalByGroupLoan = async function(groupLoanId) {
  const result = await GroupCollection.sum('total', {
    where: {
      groupLoanId,
      status: 'Approved' // Only count approved collections
    }
  });
  
  return result || 0;
};

GroupCollection.getTotalByGroup = async function(groupId, options = {}) {
  const where = {
    groupId,
    status: 'Approved'
  };
  
  if (options.dateRange) {
    where.date = {
      [Op.between]: [options.dateRange.start, options.dateRange.end]
    };
  }
  
  const result = await GroupCollection.sum('total', { where });
  return result || 0;
};

// Associations (to be defined in model initialization file)
// GroupCollection.belongsTo(Group, { foreignKey: 'groupId' });
// GroupCollection.belongsTo(GroupLoan, { foreignKey: 'groupLoanId' });
// GroupCollection.belongsTo(User, { as: 'Creator', foreignKey: 'createdById' });
// GroupCollection.belongsTo(Branch, { foreignKey: 'branchId' });
// GroupCollection.belongsTo(User, { as: 'RelationshipManager', foreignKey: 'relationshipManagerId' });

export default GroupCollection;
