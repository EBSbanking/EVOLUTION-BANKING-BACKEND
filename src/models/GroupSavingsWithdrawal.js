// models/GroupSavingsWithdrawal.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GroupSavingsWithdrawal extends Model {
  // Static methods
  static findByGroupSavings(groupSavingsId, options = {}) {
    const where = { groupSavingsId };
    
    if (options.status) {
      where.status = options.status;
    }
    
    if (options.requestedBy) {
      where.requestedBy = options.requestedBy;
    }
    
    return GroupSavingsWithdrawal.findAll({
      where,
      order: [['requestDate', 'DESC']],
      limit: options.limit || 100
    });
  }

  static findByStatus(status) {
    return GroupSavingsWithdrawal.findAll({
      where: { status },
      order: [['requestDate', 'DESC']]
    });
  }

  static findPendingWithdrawals() {
    return GroupSavingsWithdrawal.findAll({
      where: { status: 'pending' },
      order: [['requestDate', 'ASC']]
    });
  }

  static findByRequester(requestedBy, groupSavingsId = null) {
    const where = { requestedBy };
    
    if (groupSavingsId) {
      where.groupSavingsId = groupSavingsId;
    }
    
    return GroupSavingsWithdrawal.findAll({
      where,
      order: [['requestDate', 'DESC']]
    });
  }

  // Instance methods
  async addApproval(approverCustId, comments = '') {
    const approvers = this.approvers || [];
    
    // Check if already approved by this approver
    const existingApproval = approvers.find(a => a.approverCustId === approverCustId);
    
    if (existingApproval) {
      // Update existing approval
      existingApproval.status = 'approved';
      existingApproval.comments = comments;
      existingApproval.approvedAt = new Date();
    } else {
      // Add new approval
      approvers.push({
        approverCustId,
        status: 'approved',
        comments,
        approvedAt: new Date()
      });
    }
    
    const currentApprovals = approvers.filter(a => a.status === 'approved').length;
    
    await this.update({
      approvers,
      currentApprovals
    });
    
    // Check if approval threshold is met
    if (currentApprovals >= this.requiredApprovals) {
      await this.update({ status: 'approved', approvedAt: new Date() });
    }
    
    return this.reload();
  }

  async rejectApproval(approverCustId, reason = '') {
    const approvers = this.approvers || [];
    
    // Check if already approved by this approver
    const existingApproval = approvers.find(a => a.approverCustId === approverCustId);
    
    if (existingApproval) {
      // Update existing approval
      existingApproval.status = 'rejected';
      existingApproval.comments = reason;
      existingApproval.approvedAt = new Date();
    } else {
      // Add new rejection
      approvers.push({
        approverCustId,
        status: 'rejected',
        comments: reason,
        approvedAt: new Date()
      });
    }
    
    await this.update({
      approvers,
      status: 'rejected',
      rejectionReason: reason
    });
    
    return this.reload();
  }

  async approveWithdrawal() {
    return this.update({ 
      status: 'approved',
      approvedAt: new Date() 
    });
  }

  async rejectWithdrawal(reason) {
    return this.update({ 
      status: 'rejected',
      rejectionReason: reason,
      approvedAt: new Date() 
    });
  }

  async markAsDisbursed(transactionReference = '') {
    return this.update({ 
      status: 'disbursed',
      disbursedAt: new Date(),
      transactionReference 
    });
  }

  canBeApproved() {
    return this.currentApprovals >= this.requiredApprovals;
  }

  isPending() {
    return this.status === 'pending';
  }

  isApproved() {
    return this.status === 'approved';
  }

  isRejected() {
    return this.status === 'rejected';
  }

  isDisbursed() {
    return this.status === 'disbursed';
  }

  getWithdrawalDetails() {
    return {
      id: this.id,
      groupSavingsId: this.groupSavingsId,
      requestedBy: this.requestedBy,
      amount: parseFloat(this.amount),
      purpose: this.purpose,
      status: this.status,
      requiredApprovals: this.requiredApprovals,
      currentApprovals: this.currentApprovals,
      requestDate: this.requestDate,
      approvedAt: this.approvedAt,
      disbursedAt: this.disbursedAt,
      rejectionReason: this.rejectionReason,
      transactionReference: this.transactionReference,
      approvers: this.approvers || []
    };
  }

  // Getters
  get approvalProgress() {
    if (this.requiredApprovals <= 0) return 100;
    return Math.min(100, (this.currentApprovals / this.requiredApprovals) * 100);
  }

  get needsMoreApprovals() {
    return this.currentApprovals < this.requiredApprovals;
  }

  get approverIds() {
    return (this.approvers || []).map(a => a.approverCustId);
  }

  get approvedBy() {
    return (this.approvers || [])
      .filter(a => a.status === 'approved')
      .map(a => a.approverCustId);
  }

  get rejectedBy() {
    return (this.approvers || [])
      .filter(a => a.status === 'rejected')
      .map(a => a.approverCustId);
  }
}

GroupSavingsWithdrawal.init({
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
  requestedBy: {
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
      min: 0.01
    }
  },
  purpose: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 500]
    },
    set(value) {
      if (value) {
        this.setDataValue('purpose', value.trim());
      }
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'disbursed'),
    defaultValue: 'pending'
  },
  approvers: {
    type: DataTypes.JSON,
    defaultValue: [],
    validate: {
      isValidApprovers(value) {
        if (!Array.isArray(value)) {
          throw new Error('Approvers must be an array');
        }
        
        // Validate each approver object
        value.forEach((approver, index) => {
          if (!approver.approverCustId || typeof approver.approverCustId !== 'string') {
            throw new Error(`Approver at index ${index} must have approverCustId as string`);
          }
          
          if (approver.status && !['pending', 'approved', 'rejected'].includes(approver.status)) {
            throw new Error(`Approver at index ${index} has invalid status`);
          }
          
          if (approver.comments && typeof approver.comments !== 'string') {
            throw new Error(`Approver at index ${index} comments must be string`);
          }
          
          if (approver.approvedAt && !(approver.approvedAt instanceof Date) && 
              !(typeof approver.approvedAt === 'string' || typeof approver.approvedAt === 'number')) {
            throw new Error(`Approver at index ${index} approvedAt must be a valid date`);
          }
        });
      }
    }
  },
  requiredApprovals: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      isInt: true,
      min: 1,
      max: 10
    }
  },
  currentApprovals: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      isInt: true,
      min: 0
    }
  },
  requestDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  disbursedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(value) {
      if (value) {
        this.setDataValue('rejectionReason', value.trim());
      }
    }
  },
  transactionReference: {
    type: DataTypes.STRING(50),
    allowNull: true,
    validate: {
      len: [0, 50]
    }
  }
}, {
  sequelize,
  modelName: 'GroupSavingsWithdrawal',
  tableName: 'GroupSavingsWithdrawals',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeSave: (withdrawal, options) => {
      // Calculate current approvals from approvers array
      if (withdrawal.approvers && Array.isArray(withdrawal.approvers)) {
        withdrawal.currentApprovals = withdrawal.approvers
          .filter(a => a.status === 'approved')
          .length;
      } else {
        withdrawal.currentApprovals = 0;
        withdrawal.approvers = [];
      }
      
      // Auto-approve if required approvals are met
      if (withdrawal.currentApprovals >= withdrawal.requiredApprovals && 
          withdrawal.status === 'pending') {
        withdrawal.status = 'approved';
        withdrawal.approvedAt = new Date();
      }
    },
    
    beforeCreate: (withdrawal, options) => {
      // Set default required approvals if not specified
      if (!withdrawal.requiredApprovals) {
        withdrawal.requiredApprovals = 1;
      }
    }
  },
  indexes: [
    {
      name: 'idx_group_savings_withdrawal_group',
      fields: ['groupSavingsId']
    },
    {
      name: 'idx_group_savings_withdrawal_status',
      fields: ['status']
    },
    {
      name: 'idx_group_savings_withdrawal_requester',
      fields: ['requestedBy']
    },
    {
      name: 'idx_group_savings_withdrawal_date',
      fields: ['requestDate']
    },
    {
      name: 'idx_group_savings_withdrawal_approved_date',
      fields: ['approvedAt']
    },
    {
      name: 'idx_group_savings_withdrawal_disbursed_date',
      fields: ['disbursedAt']
    },
    // Composite indexes for common queries
    {
      name: 'idx_group_savings_withdrawal_group_status',
      fields: ['groupSavingsId', 'status']
    },
    {
      name: 'idx_group_savings_withdrawal_requester_status',
      fields: ['requestedBy', 'status']
    },
    {
      name: 'idx_group_savings_withdrawal_pending_date',
      fields: ['status', 'requestDate'],
      where: { status: 'pending' }
    }
  ]
});

export default GroupSavingsWithdrawal;