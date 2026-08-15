// models/InsurancePolicy.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class InsurancePolicy extends Model {
  // Virtual property (getter) for isActive
  get isActive() {
    const now = new Date();
    return this.status === 'ACTIVE' && this.endDate > now;
  }

  // Instance method
  isExpiringSoon() {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return this.endDate <= thirtyDaysFromNow && this.status === 'ACTIVE';
  }
}

InsurancePolicy.init({
  // Core Policy Information
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  policyNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  policyType: {
    type: DataTypes.ENUM('LOAN_PROTECTION', 'LIFE', 'HEALTH', 'AUTO', 'PROPERTY', 'TRAVEL', 'BUSINESS'),
    allowNull: false,
    defaultValue: 'LOAN_PROTECTION'
  },
  
  // Financial Details
  premiumAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  insuredAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  coverageAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  
  // Dates
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  coverageDuration: {
    type: DataTypes.INTEGER, // in days
    allowNull: false,
    validate: {
      min: 1
    }
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'CLAIMED'),
    defaultValue: 'ACTIVE'
  },
  
  // Relationships (Foreign Keys)
  loanAccountId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'loan_accounts',
      key: 'id'
    }
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  customerName: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  
  // Insurance Provider
  provider: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'DEFAULT_INSURER'
  },
  providerCode: {
    type: DataTypes.STRING(50)
  },
  
  // Branch Information
  branchCode: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  branchId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'branches',
      key: 'id'
    }
  },
  
  // Payment Information
  premiumPaid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paymentDate: {
    type: DataTypes.DATE
  },
  paymentMethod: {
    type: DataTypes.ENUM('LOAN_DISBURSEMENT', 'CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'DIRECT_DEBIT'),
    defaultValue: 'LOAN_DISBURSEMENT'
  },
  
  // GL Account Integration
  glAccountCode: {
    type: DataTypes.STRING(20) // Links to INSURANCE_FEE GL account
  },
  transactionReference: {
    type: DataTypes.STRING(100) // Reference to the ledger transaction
  },
  
  // Coverage Details
  coverageType: {
    type: DataTypes.ENUM('FULL_LOAN_COVERAGE', 'PARTIAL_COVERAGE', 'LIFE_COVERAGE', 'ASSET_COVERAGE'),
    defaultValue: 'FULL_LOAN_COVERAGE'
  },
  
  // JSON field for beneficiaries (alternative to separate table)
  beneficiaries: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  
  // JSON field for claim history (alternative to separate table)
  claimHistory: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  
  // Audit Fields
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Metadata for integration with your GL system
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  sequelize,
  modelName: 'InsurancePolicy',
  tableName: 'insurance_policies',
  timestamps: true, // creates createdAt and updatedAt
  hooks: {
    beforeUpdate: (policy) => {
      policy.updatedAt = new Date();
    }
  },
  indexes: [
    {
      name: 'idx_policy_number',
      fields: ['policyNumber']
    },
    {
      name: 'idx_loan_account',
      fields: ['loanAccountId']
    },
    {
      name: 'idx_customer',
      fields: ['customerId']
    },
    {
      name: 'idx_branch',
      fields: ['branchCode']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_end_date',
      fields: ['endDate']
    },
    {
      name: 'idx_branch_status',
      fields: ['branchCode', 'status']
    },
    {
      name: 'idx_customer_status',
      fields: ['customerId', 'status']
    },
    {
      name: 'idx_active_policies',
      fields: ['status', 'endDate']
    }
  ]
});

// Static method to find active policies by branch
InsurancePolicy.findActiveByBranch = async function(branchCode) {
  return await this.findAll({
    where: {
      branchCode,
      status: 'ACTIVE',
      endDate: { [Op.gt]: new Date() }
    }
  });
};

// Static method to calculate total insured amount by branch
InsurancePolicy.getTotalInsuredByBranch = async function(branchCode) {
  const result = await this.findAll({
    attributes: [
      [sequelize.fn('SUM', sequelize.col('insuredAmount')), 'totalInsuredAmount'],
      [sequelize.fn('SUM', sequelize.col('premiumAmount')), 'totalPremium'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'policyCount']
    ],
    where: {
      branchCode,
      status: 'ACTIVE',
      endDate: { [Op.gt]: new Date() }
    },
    group: ['branchCode'],
    raw: true
  });
  
  return result[0] || { totalInsuredAmount: 0, totalPremium: 0, policyCount: 0 };
};

// Static method to find expiring policies (within X days)
InsurancePolicy.findExpiringPolicies = async function(days = 30) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  
  return await this.findAll({
    where: {
      status: 'ACTIVE',
      endDate: {
        [Op.between]: [new Date(), expiryDate]
      }
    },
    order: [['endDate', 'ASC']]
  });
};

export default InsurancePolicy;
