// models/GroupSavingsContribution.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GroupSavingsContribution extends Model {
  // Static methods
  static findByGroupSavings(groupSavingsId, options = {}) {
    const where = { groupSavingsId };
    
    if (options.period) {
      where.period = options.period;
    }
    
    if (options.status) {
      where.status = options.status;
    }
    
    if (options.memberCustId) {
      where.memberCustId = options.memberCustId;
    }
    
    return GroupSavingsContribution.findAll({
      where,
      order: [['contributionDate', 'DESC']],
      limit: options.limit || 100
    });
  }

  static findByPeriod(period) {
    return GroupSavingsContribution.findAll({
      where: { period },
      order: [['contributionDate', 'DESC']]
    });
  }

  static getTotalByGroupSavings(groupSavingsId, options = {}) {
    const where = { 
      groupSavingsId,
      status: 'completed'
    };
    
    if (options.period) {
      where.period = options.period;
    }
    
    if (options.contributionType) {
      where.contributionType = options.contributionType;
    }
    
    return GroupSavingsContribution.sum('amount', { where });
  }

  static getMemberContributions(memberCustId, groupSavingsId = null) {
    const where = { 
      memberCustId,
      status: 'completed'
    };
    
    if (groupSavingsId) {
      where.groupSavingsId = groupSavingsId;
    }
    
    return GroupSavingsContribution.findAll({
      where,
      order: [['contributionDate', 'DESC']]
    });
  }

  // Instance methods
  async markAsCompleted() {
    return this.update({ status: 'completed' });
  }

  async markAsFailed(reason) {
    return this.update({ 
      status: 'failed',
      notes: reason ? `${this.notes || ''} Failed: ${reason}`.trim() : this.notes
    });
  }

  getContributionDetails() {
    return {
      id: this.id,
      groupSavingsId: this.groupSavingsId,
      memberCustId: this.memberCustId,
      amount: parseFloat(this.amount),
      contributionDate: this.contributionDate,
      contributionType: this.contributionType,
      period: this.period,
      status: this.status,
      reference: this.reference,
      collectedBy: this.collectedBy,
      notes: this.notes
    };
  }

  // Getters
  get isRegularContribution() {
    return this.contributionType === 'regular';
  }

  get isSpecialContribution() {
    return this.contributionType === 'special';
  }

  get isPenalty() {
    return this.contributionType === 'penalty';
  }

  get isInitialContribution() {
    return this.contributionType === 'initial';
  }
}

GroupSavingsContribution.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  groupSavingsId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'GroupSavings',
      key: 'id'
    },
    validate: {
      notNull: true
    }
  },
  memberCustId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 20]
    }
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  contributionDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  contributionType: {
    type: DataTypes.ENUM('regular', 'special', 'penalty', 'initial'),
    defaultValue: 'regular'
  },
  period: {
    type: DataTypes.STRING(7), // e.g., "2024-01" for January 2024
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^\d{4}-\d{2}$/ // Validate format YYYY-MM
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'completed'
  },
  reference: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true,
    validate: {
      len: [0, 50]
    }
  },
  collectedBy: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 20]
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(value) {
      if (value) {
        this.setDataValue('notes', value.trim());
      }
    }
  }
}, {
  sequelize,
  modelName: 'GroupSavingsContribution',
  tableName: 'GroupSavingsContributions',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeCreate: (contribution, options) => {
      // Generate reference if not provided
      if (!contribution.reference) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        contribution.reference = `GSC-${timestamp}-${random}`;
      }
      
      // Ensure period is in correct format
      if (contribution.period && !/^\d{4}-\d{2}$/.test(contribution.period)) {
        // Try to format date if period is a date
        const date = new Date(contribution.period);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          contribution.period = `${year}-${month}`;
        }
      }
    }
  },
  indexes: [
    {
      name: 'idx_group_savings_contrib_group_savings',
      fields: ['groupSavingsId']
    },
    {
      name: 'idx_group_savings_contrib_member',
      fields: ['memberCustId']
    },
    {
      name: 'idx_group_savings_contrib_period',
      fields: ['period']
    },
    {
      name: 'idx_group_savings_contrib_date',
      fields: ['contributionDate']
    },
    {
      name: 'idx_group_savings_contrib_status',
      fields: ['status']
    },
    {
      name: 'idx_group_savings_contrib_type',
      fields: ['contributionType']
    },
    {
      name: 'idx_group_savings_contrib_reference',
      fields: ['reference'],
      unique: true
    },
    {
      name: 'idx_group_savings_contrib_collected_by',
      fields: ['collectedBy']
    },
    // Composite indexes for common queries
    {
      name: 'idx_group_savings_member_period',
      fields: ['groupSavingsId', 'memberCustId', 'period']
    },
    {
      name: 'idx_group_savings_period_status',
      fields: ['groupSavingsId', 'period', 'status']
    },
    {
      name: 'idx_member_period_type',
      fields: ['memberCustId', 'period', 'contributionType']
    }
  ]
});

export default GroupSavingsContribution;
