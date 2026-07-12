// models/InterestDistribution.js - UPDATED

import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class InterestDistribution extends Model {
  static associate(models) {
    this.belongsTo(models.TermDeposit, { 
      foreignKey: 'termDepositId', 
      as: 'termDeposit' 
    });
    this.belongsTo(models.CustomerAccount, { 
      foreignKey: 'targetAccountId', 
      as: 'targetAccount' 
    });
  }
}

InterestDistribution.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    termDepositId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'term_deposit_id',
      references: { 
        model: 'term_deposits', 
        key: 'id' 
      }
    },
    targetAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'target_account_id',
      references: { 
        model: 'customer_accounts', 
        key: 'id' 
      }
    },
    targetAccountNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'target_account_number',
      comment: 'Store account number for easy reference'
    },
    percentage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { 
        min: 0.01, 
        max: 100 
      }
    },
    amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at'
    },
    failureReason: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'failure_reason'
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    // Additional fields for tracking
    createdBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'created_by'
    },
    updatedBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'updated_by'
    }
  },
  {
    sequelize,
    modelName: 'InterestDistribution',
    tableName: 'interest_distributions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeValidate: async (distribution) => {
        // ✅ Skip validation if status is FAILED or if this is a rejection
        if (distribution.status === 'FAILED') {
          return;
        }
        
        // ✅ Also skip validation if this is a distribution being marked as failed
        if (distribution.changed('status') && distribution.status === 'FAILED') {
          return;
        }
        
        if (distribution.percentage) {
          // ✅ Only validate PENDING distributions
          // Exclude FAILED distributions from the total calculation
          const total = await InterestDistribution.sum('percentage', {
            where: { 
              termDepositId: distribution.termDepositId,
              status: 'PENDING',  // ✅ Only count PENDING distributions
              id: { [sequelize.Op.ne]: distribution.id } // ✅ Exclude current distribution
            }
          });
          const newTotal = (total || 0) + parseFloat(distribution.percentage);
          if (newTotal > 100) {
            throw new Error(`Total distribution percentage (${newTotal}%) exceeds 100%`);
          }
        }
      },
      beforeCreate: async (distribution) => {
        // Populate targetAccountNumber if not provided
        if (!distribution.targetAccountNumber && distribution.targetAccountId) {
          const CustomerAccount = sequelize.models.CustomerAccount;
          if (CustomerAccount) {
            const account = await CustomerAccount.findByPk(distribution.targetAccountId);
            if (account) {
              distribution.targetAccountNumber = account.ACCT_NO || account.account_number;
            }
          }
        }
      },
      afterCreate: (distribution) => {
        console.log(`InterestDistribution created for term deposit ${distribution.termDepositId}`);
      },
      afterUpdate: (distribution) => {
        if (distribution.changed('status')) {
          console.log(`InterestDistribution ${distribution.id} status changed to ${distribution.status}`);
        }
      }
    }
  }
);

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Mark distribution as processed
 */
InterestDistribution.prototype.markAsProcessed = async function(amount, transaction = null) {
  this.status = 'PROCESSED';
  this.amount = amount || this.amount;
  this.processedAt = new Date();
  return await this.save({ transaction });
};

/**
 * Mark distribution as failed - SKIPS VALIDATION
 */
InterestDistribution.prototype.markAsFailed = async function(reason, transaction = null) {
  this.status = 'FAILED';
  this.failureReason = reason;
  this.processedAt = new Date();
  // ✅ Use validate: false to skip all validation
  return await this.save({ transaction, validate: false });
};

/**
 * Calculate distribution amount based on total interest
 */
InterestDistribution.prototype.calculateAmount = function(totalInterest) {
  return (totalInterest * parseFloat(this.percentage)) / 100;
};

// ============================================================
// STATIC METHODS
// ============================================================

/**
 * Get all distributions for a term deposit with total percentage verification
 */
InterestDistribution.getDistributionsWithVerification = async function(termDepositId, transaction = null) {
  const options = transaction ? { transaction } : {};
  const distributions = await this.findAll({
    where: { termDepositId },
    include: ['targetAccount'],
    ...options
  });
  
  // ✅ Only sum PENDING distributions for validation
  const totalPercentage = distributions
    .filter(d => d.status === 'PENDING')
    .reduce((sum, dist) => sum + parseFloat(dist.percentage), 0);
  
  return {
    distributions,
    totalPercentage,
    isValid: totalPercentage <= 100
  };
};

/**
 * Bulk create distributions with validation
 */
InterestDistribution.bulkCreateWithValidation = async function(termDepositId, distributions, transaction = null) {
  // Validate total percentage first
  const existingDistributions = await this.findAll({
    where: { 
      termDepositId,
      status: 'PENDING' // ✅ Only check PENDING distributions
    },
    transaction
  });
  
  const existingTotal = existingDistributions.reduce((sum, d) => sum + parseFloat(d.percentage), 0);
  const newTotal = distributions.reduce((sum, d) => sum + parseFloat(d.percentage), 0);
  
  if (existingTotal + newTotal > 100) {
    throw new Error(`Total distribution percentage (${existingTotal + newTotal}%) exceeds 100%`);
  }
  
  // Create distributions
  const options = transaction ? { transaction } : {};
  return await this.bulkCreate(
    distributions.map(d => ({
      termDepositId,
      ...d
    })),
    options
  );
};

export default InterestDistribution;