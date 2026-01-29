// models/AccountApplication.js
import { Sequelize, DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// Import operators
const { Op } = Sequelize;

class AccountApplication extends Model {
  // Static method: Find by customer ID
  static async findByCustomerId(customerId) {
    return this.findAll({
      where: { customer_id: customerId },
      order: [['created_at', 'DESC']]
    });
  }

  // Static method: Find pending applications
  static async findPending() {
    return this.findAll({
      where: { status: 'PENDING' },
      order: [['created_at', 'DESC']]
    });
  }

  // Static method: Find by account number
  static async findByAccountNumber(accountNumber) {
    return this.findOne({
      where: { account_number: accountNumber }
    });
  }

  // Instance method: Approve application
  async approve(approvedBy) {
    this.status = 'APPROVED';
    this.approved_by = approvedBy;
    this.approved_at = new Date();
    this.updated_at = new Date();
    return await this.save();
  }

  // Instance method: Reject application
  async reject(reason, rejectedBy) {
    this.status = 'REJECTED';
    this.rejection_reason = reason;
    this.rejected_by = rejectedBy;
    this.rejected_at = new Date();
    this.updated_at = new Date();
    return await this.save();
  }

  // Instance method: Check if pending
  isPending() {
    return this.status === 'PENDING';
  }

  // Instance method: Check if approved
  isApproved() {
    return this.status === 'APPROVED';
  }

  // Instance method: Check if rejected
  isRejected() {
    return this.status === 'REJECTED';
  }

  // Instance method: Get application summary
  getApplicationSummary() {
    return {
      id: this.id,
      customerId: this.customer_id,
      accountNumber: this.account_number,
      accountName: this.account_name,
      depositorName: this.depositor_name,
      documentType: this.document_type,
      documentNumber: this.document_number,
      amount: this.amount,
      status: this.status,
      createdBy: this.created_by,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
      approvedBy: this.approved_by,
      approvedAt: this.approved_at,
      rejectedBy: this.rejected_by,
      rejectedAt: this.rejected_at,
      rejectionReason: this.rejection_reason,
      notes: this.notes,
      branchId: this.branch_id,
      branchName: this.branch_name, // Added
      productId: this.product_id,
      currency: this.currency,
      userId: this.user_id // Added
    };
  }

  // Instance method: Get application details for workflow
  getWorkflowDetails() {
    return {
      applicationId: this.id,
      customerId: this.customer_id,
      accountNumber: this.account_number,
      accountName: this.account_name,
      depositorName: this.depositor_name,
      amount: this.amount,
      status: this.status,
      documentType: this.document_type,
      documentNumber: this.document_number,
      createdAt: this.created_at,
      branchId: this.branch_id,
      branchName: this.branch_name, // Added
      userId: this.user_id // Added
    };
  }
}

AccountApplication.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  customer_id: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      is: /^\d{10}$/,
      notEmpty: true
    },
    comment: 'Customer identifier (10 digits)'
  },
  
  account_number: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      is: /^\d{10}$/,
      notEmpty: true,
      customValidator(value) {
        if (!value.startsWith('2')) {
          throw new Error('Savings account number must start with "2" for NUBAN format');
        }
      }
    },
    comment: 'Account number (NUBAN format)'
  },
  
  account_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    },
    comment: 'Account holder name'
  },
  
  depositor_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 255]
    },
    comment: 'Name of person making deposit'
  },
  
  document_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true,
      isIn: [['Passport', 'National ID', 'Driver License', 'Voter Card', 'Other']]
    },
    comment: 'Type of identification document'
  },
  
  document_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    },
    comment: 'Document identification number'
  },
  
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    },
    comment: 'Opening deposit amount'
  },
  
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'CANCELLED']]
    },
    comment: 'Application status'
  },
  
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    },
    comment: 'User who created the application'
  },
  
  user_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User identifier'
  },
  
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  },
  
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  },
  
  // Optional fields you might want to add later
  approved_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User who approved the application'
  },
  
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approval timestamp'
  },
  
  rejected_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User who rejected the application'
  },
  
  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Rejection timestamp'
  },
  
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for rejection'
  },
  
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes'
  },
  
  branch_id: {
    type: DataTypes.STRING(3),
    allowNull: true,
    validate: {
      is: /^\d{3}$/
    },
    comment: 'Branch identifier'
  },
  
  branch_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Branch name'
  },
  
  product_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Product identifier'
  },
  
  currency: {
    type: DataTypes.STRING(3),
    allowNull: true,
    defaultValue: 'NGN',
    comment: 'Currency code'
  },
  
  // Add document_urls field for Cloudinary storage
  document_urls: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('document_urls');
      return rawValue ? JSON.parse(rawValue) : null;
    },
    set(value) {
      this.setDataValue('document_urls', value ? JSON.stringify(value) : null);
    },
    comment: 'JSON array of uploaded document URLs from Cloudinary'
  }
}, {
  sequelize,
  modelName: 'AccountApplication',
  tableName: 'account_applications',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  freezeTableName: true,
  
  indexes: [
    {
      fields: ['customer_id'],
      name: 'idx_customer_id'
    },
    {
      fields: ['account_number'],
      unique: true,
      name: 'idx_account_number'
    },
    {
      fields: ['status'],
      name: 'idx_status'
    },
    {
      fields: ['created_at'],
      name: 'idx_created_at'
    },
    {
      fields: ['customer_id', 'status'],
      name: 'idx_customer_status'
    },
    {
      fields: ['document_type'],
      name: 'idx_document_type'
    },
    {
      fields: ['branch_id'],
      name: 'idx_branch_id'
    },
    {
      fields: ['user_id'],
      name: 'idx_user_id'
    },
    {
      fields: ['branch_name'],
      name: 'idx_branch_name'
    }
  ],
  
  hooks: {
    beforeValidate: (application) => {
      // Trim string fields
      const fieldsToTrim = [
        'customer_id', 'account_number', 'account_name', 'depositor_name',
        'document_type', 'document_number', 'created_by', 'user_id',
        'approved_by', 'rejected_by', 'branch_id', 'branch_name',
        'product_id', 'currency'
      ];
      
      fieldsToTrim.forEach(field => {
        if (application[field]) {
          application[field] = application[field].toString().trim();
        }
      });
      
      // Pad customer_id to 10 digits
      if (application.customer_id) {
        application.customer_id = String(application.customer_id).padStart(10, '0');
      }
      
      // Ensure status is uppercase
      if (application.status) {
        application.status = application.status.toUpperCase();
      }
      
      // Ensure currency is uppercase
      if (application.currency) {
        application.currency = application.currency.toUpperCase();
      }
    },
    
    beforeCreate: (application) => {
      // Set timestamps
      const now = new Date();
      application.created_at = now;
      application.updated_at = now;
      
      // Set user_id from created_by if not provided
      if (!application.user_id && application.created_by) {
        application.user_id = application.created_by;
      }
      
      // Validate customer_id format
      if (!/^\d{10}$/.test(application.customer_id)) {
        throw new Error(`CUST_ID ${application.customer_id} is invalid. Must be 10 digits`);
      }
      
      // Validate account_number format (NUBAN)
      if (!/^\d{10}$/.test(application.account_number)) {
        throw new Error(`Account number ${application.account_number} is invalid. Must be 10 digits`);
      }
      
      // For NUBAN accounts, ensure it starts with '2' for savings
      if (!application.account_number.startsWith('2')) {
        throw new Error('Savings account number must start with "2" for NUBAN format');
      }
    },
    
    beforeUpdate: (application) => {
      // Update timestamp
      application.updated_at = new Date();
      
      // Set approval/rejection timestamps if status is changing
      if (application.changed('status')) {
        if (application.status === 'APPROVED' && !application.approved_at) {
          application.approved_at = new Date();
        } else if (application.status === 'REJECTED' && !application.rejected_at) {
          application.rejected_at = new Date();
        }
      }
    },
    
    afterCreate: async (application) => {
      // Log creation
      console.log(`✅ AccountApplication created: ${application.id} for customer ${application.customer_id}`);
    }
  },
  
  scopes: {
    pending: {
      where: { status: 'PENDING' }
    },
    approved: {
      where: { status: 'APPROVED' }
    },
    rejected: {
      where: { status: 'REJECTED' }
    },
    processing: {
      where: { status: 'PROCESSING' }
    },
    cancelled: {
      where: { status: 'CANCELLED' }
    },
    byCustomer: (customerId) => ({
      where: { customer_id: customerId }
    }),
    byAccountNumber: (accountNumber) => ({
      where: { account_number: accountNumber }
    }),
    byDocumentType: (documentType) => ({
      where: { document_type: documentType }
    }),
    byBranch: (branchId) => ({
      where: { branch_id: branchId }
    }),
    byBranchName: (branchName) => ({
      where: { branch_name: branchName }
    }),
    byCreator: (createdBy) => ({
      where: { created_by: createdBy }
    }),
    byUserId: (userId) => ({
      where: { user_id: userId }
    }),
    recent: {
      order: [['created_at', 'DESC']],
      limit: 100
    },
    today: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    },
    thisWeek: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 7))
        }
      }
    },
    thisMonth: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      }
    },
    withDocuments: {
      where: {
        document_urls: {
          [Op.ne]: null
        }
      }
    },
    withoutDocuments: {
      where: {
        document_urls: null
      }
    }
  },
  
  classMethods: {
    async getStatistics() {
      const stats = await this.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END")), 'pending'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END")), 'approved'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END")), 'rejected'],
          [sequelize.fn('SUM', sequelize.literal('amount')), 'total_amount']
        ],
        raw: true
      });
      
      return stats[0] || {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        total_amount: 0
      };
    },
    
    async getPendingCount() {
      const count = await this.count({
        where: { status: 'PENDING' }
      });
      return count;
    },
    
    async findRecentApplications(limit = 10) {
      return this.findAll({
        order: [['created_at', 'DESC']],
        limit: limit
      });
    }
  }
});

// Define associations if needed
AccountApplication.associate = function(models) {
  // You can define associations here if you have related models
  // Example:
  // AccountApplication.belongsTo(models.Customer, {
  //   foreignKey: 'customer_id',
  //   targetKey: 'CUST_ID',
  //   as: 'customer'
  // });
};

export default AccountApplication;