// src/models/PendingTransfer.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PendingTransfer = sequelize.define('PendingTransfer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  sender_account: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'sender_account',
    comment: 'Sender\'s account number from external bank'
  },
  sender_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'sender_name',
    comment: 'Sender\'s full name from external bank'
  },
  sender_bank: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'sender_bank',
    comment: 'External bank name (First Bank, UBA, GTBank, etc.)'
  },
  beneficiary_account: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'beneficiary_account',
    comment: 'Evolution Banking account number that received the funds'
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'amount',
    comment: 'Amount received in Naira'
  },
  narration: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'narration',
    comment: 'Narration from the transfer (may contain customer code)'
  },
  transaction_ref: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'transaction_ref',
    comment: 'Transaction reference from external bank'
  },
  transaction_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'transaction_date',
    comment: 'Date of the transaction from external bank'
  },
  source: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'source',
    comment: 'Source of the transfer (PAYSTACK, EXTERNAL_BANK, NIP, etc.)'
  },
  status: {
    type: DataTypes.ENUM('PENDING_MATCHING', 'MATCHED', 'FAILED', 'MANUAL_REVIEW', 'CANCELLED'),
    defaultValue: 'PENDING_MATCHING',
    field: 'status',
    comment: 'Status of the pending transfer'
  },
  matched_to_customer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'matched_to_customer_id',
    comment: 'Customer ID if matched',
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  matched_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'matched_at',
    comment: 'When the transfer was matched'
  },
  matched_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'matched_by',
    comment: 'Who matched the transfer (user or system)'
  },
  inward_transfer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'inward_transfer_id',
    comment: 'Reference to InwardFundsTransfer after matching',
    references: {
      model: 'inward_funds_transfer',
      key: 'INWD_FUNDS_XFER_ID'
    }
  },
  pending_inward_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'pending_inward_id',
    comment: 'Reference to PendingInwardTransaction after matching',
    references: {
      model: 'PendingInwardTransaction',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'notes',
    comment: 'Additional notes or comments'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'metadata',
    comment: 'Additional metadata about the transfer'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'pending_transfers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['sender_account']
    },
    {
      fields: ['beneficiary_account']
    },
    {
      fields: ['transaction_ref']
    },
    {
      fields: ['source']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['matched_to_customer_id']
    }
  ]
});

// ==================== INSTANCE METHODS ====================

/**
 * Match this pending transfer to a customer
 */
PendingTransfer.prototype.matchToCustomer = async function(customerId, matchedBy, notes = '') {
  this.matched_to_customer_id = customerId;
  this.matched_at = new Date();
  this.matched_by = matchedBy;
  this.status = 'MATCHED';
  if (notes) this.notes = notes;
  return await this.save();
};

/**
 * Mark this pending transfer as failed
 */
PendingTransfer.prototype.markAsFailed = async function(reason) {
  this.status = 'FAILED';
  this.notes = reason || 'Failed to process';
  return await this.save();
};

/**
 * Mark this pending transfer for manual review
 */
PendingTransfer.prototype.markForManualReview = async function(reason) {
  this.status = 'MANUAL_REVIEW';
  this.notes = reason || 'Requires manual review';
  return await this.save();
};

/**
 * Cancel this pending transfer
 */
PendingTransfer.prototype.cancel = async function(reason) {
  this.status = 'CANCELLED';
  this.notes = reason || 'Cancelled';
  return await this.save();
};

/**
 * Link to inward transfer after processing
 */
PendingTransfer.prototype.linkToInwardTransfer = async function(inwardTransferId) {
  this.inward_transfer_id = inwardTransferId;
  return await this.save();
};

/**
 * Link to pending inward transaction
 */
PendingTransfer.prototype.linkToPendingInward = async function(pendingInwardId) {
  this.pending_inward_id = pendingInwardId;
  return await this.save();
};

/**
 * Check if this transfer can be matched
 */
PendingTransfer.prototype.canMatch = function() {
  return this.status === 'PENDING_MATCHING' || this.status === 'MANUAL_REVIEW';
};

/**
 * Check if this transfer is already matched
 */
PendingTransfer.prototype.isMatched = function() {
  return this.status === 'MATCHED';
};

/**
 * Get customer details if matched
 */
PendingTransfer.prototype.getMatchedCustomer = async function() {
  if (!this.matched_to_customer_id) return null;
  const Customer = (await import('./Customer.js')).default;
  return await Customer.findByPk(this.matched_to_customer_id);
};

/**
 * Get transfer summary
 */
PendingTransfer.prototype.getSummary = function() {
  return {
    id: this.id,
    sender_name: this.sender_name,
    sender_account: this.sender_account,
    sender_bank: this.sender_bank,
    beneficiary_account: this.beneficiary_account,
    amount: this.amount,
    narration: this.narration,
    transaction_ref: this.transaction_ref,
    source: this.source,
    status: this.status,
    created_at: this.created_at,
    matched_at: this.matched_at,
    matched_to_customer_id: this.matched_to_customer_id
  };
};

// ==================== STATIC METHODS ====================

/**
 * Find pending transfers by customer ID
 */
PendingTransfer.findByCustomer = async function(customerId, options = {}) {
  const { limit = 50, offset = 0, status = 'PENDING_MATCHING' } = options;
  
  return await this.findAndCountAll({
    where: {
      matched_to_customer_id: customerId,
      status: status
    },
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });
};

/**
 * Find pending transfers by beneficiary account
 */
PendingTransfer.findByBeneficiaryAccount = async function(accountNumber, options = {}) {
  const { limit = 50, offset = 0, status = 'PENDING_MATCHING' } = options;
  
  return await this.findAndCountAll({
    where: {
      beneficiary_account: accountNumber,
      status: status
    },
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });
};

/**
 * Find pending transfers by sender account
 */
PendingTransfer.findBySenderAccount = async function(accountNumber, options = {}) {
  const { limit = 50, offset = 0, status = 'PENDING_MATCHING' } = options;
  
  return await this.findAndCountAll({
    where: {
      sender_account: accountNumber,
      status: status
    },
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });
};

/**
 * Find pending transfers by source
 */
PendingTransfer.findBySource = async function(source, options = {}) {
  const { limit = 50, offset = 0, status = 'PENDING_MATCHING' } = options;
  
  return await this.findAndCountAll({
    where: {
      source: source,
      status: status
    },
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });
};

/**
 * Get statistics for pending transfers
 */
PendingTransfer.getStatistics = async function() {
  const stats = await this.findAll({
    where: { status: 'PENDING_MATCHING' },
    attributes: [
      [sequelize.fn('COUNT', sequelize.col('id')), 'totalPending'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      [sequelize.fn('AVG', sequelize.col('amount')), 'averageAmount']
    ],
    raw: true
  });

  const bySource = await this.findAll({
    where: { status: 'PENDING_MATCHING' },
    attributes: [
      'source',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
    ],
    group: ['source'],
    raw: true
  });

  const byBank = await this.findAll({
    where: { status: 'PENDING_MATCHING' },
    attributes: [
      'sender_bank',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
    ],
    group: ['sender_bank'],
    raw: true
  });

  return {
    totals: {
      totalPending: parseInt(stats[0]?.totalPending) || 0,
      totalAmount: parseFloat(stats[0]?.totalAmount) || 0,
      averageAmount: parseFloat(stats[0]?.averageAmount) || 0
    },
    bySource: bySource,
    byBank: byBank
  };
};

/**
 * Bulk match pending transfers
 */
PendingTransfer.bulkMatch = async function(pendingIds, customerId, matchedBy) {
  const transaction = await sequelize.transaction();
  
  try {
    const results = {
      matched: [],
      failed: []
    };

    for (const pendingId of pendingIds) {
      try {
        const pending = await this.findByPk(pendingId, { transaction });
        if (!pending) {
          results.failed.push({ id: pendingId, reason: 'Not found' });
          continue;
        }
        
        if (!pending.canMatch()) {
          results.failed.push({ id: pendingId, reason: `Cannot match: ${pending.status}` });
          continue;
        }

        await pending.matchToCustomer(customerId, matchedBy);
        results.matched.push(pendingId);
      } catch (error) {
        results.failed.push({ id: pendingId, reason: error.message });
      }
    }

    await transaction.commit();
    return results;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export default PendingTransfer;