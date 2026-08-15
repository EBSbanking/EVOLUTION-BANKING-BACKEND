// src/models/FlutterwaveTransaction.js
import { DataTypes, Model, Op } from 'sequelize';  // ✅ Add Op to imports
import sequelize from '../../config/db.js';

class FlutterwaveTransaction extends Model {
  /**
   * Check if transaction is successful
   */
  isSuccessful() {
    return this.status === 'SUCCESS';
  }

  /**
   * Check if transaction is pending
   */
  isPending() {
    return this.status === 'PENDING' || this.status === 'PENDING_MATCHING';
  }

  /**
   * Check if transaction failed
   */
  isFailed() {
    return this.status === 'FAILED';
  }

  /**
   * Check if transaction is refunded
   */
  isRefunded() {
    return this.status === 'REFUNDED';
  }

  /**
   * Get masked card number for display
   */
  getMaskedCardNumber() {
    if (!this.card_last4) return null;
    return `**** **** **** ${this.card_last4}`;
  }

  /**
   * Get transaction summary
   */
  getSummary() {
    return {
      reference: this.transaction_reference,
      flutterwave_reference: this.flutterwave_reference,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      customer: this.email,
      card_type: this.card_type,
      card_last4: this.card_last4,
      created_at: this.createdAt
    };
  }

  /**
   * Check if transaction matches a reference
   */
  matchesReference(reference) {
    return this.transaction_reference === reference || 
           this.flutterwave_reference === reference;
  }

  /**
   * Get refund eligibility
   */
  isRefundable() {
    return this.status === 'SUCCESS' && 
           !this.refund_data && 
           this.amount > 0;
  }

  /**
   * Get transaction age in minutes
   */
  getAgeInMinutes() {
    const now = new Date();
    const diff = now - this.createdAt;
    return Math.floor(diff / 60000);
  }
}

FlutterwaveTransaction.init({
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },

  // Transaction reference (your internal reference)
  transaction_reference: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },

  // Flutterwave reference
  flutterwave_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },

  // Customer details
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },

  // Transaction details
  amount: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: false,
    validate: {
      min: 0
    }
  },

  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'NGN',
    validate: {
      isIn: [['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR', 'UGX', 'TZS', 'RWF']]
    }
  },

  // Transaction status
  status: {
    type: DataTypes.ENUM(
      'PENDING',           // Initial state
      'PENDING_MATCHING',  // Payment received, matching pending
      'PROCESSING',        // Processing in progress
      'SUCCESS',           // Payment successful
      'FAILED',            // Payment failed
      'CANCELLED',         // Payment cancelled
      'REFUNDED',          // Payment refunded
      'REVERSED',          // Payment reversed
      'EXPIRED',           // Payment expired
      'AUTHENTICATING'     // 3D Secure/PIN authentication in progress
    ),
    allowNull: false,
    defaultValue: 'PENDING'
  },

  // Payment details
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'card, bank_transfer, mobile_money, ussd, qr'
  },

  channel: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Payment channel used'
  },

  // Card details
  card_type: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'VISA, MASTERCARD, AMEX, VERVE, etc.'
  },

  card_last4: {
    type: DataTypes.STRING(4),
    allowNull: true,
    validate: {
      len: [4, 4]
    }
  },

  card_expiry: {
    type: DataTypes.STRING(7),
    allowNull: true,
    comment: 'MM/YYYY format'
  },

  // Customer account mapping
  customer_account: {
    type: DataTypes.STRING(20),
    allowNull: true,
    references: {
      model: 'customer_accounts',
      key: 'account_number'
    }
  },

  customer_code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  // Inward transfer details
  inward_transfer_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Reference to inward_transfers table'
  },

  pending_transfer_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Reference to pending transfers table'
  },

  customer_matched_by: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'How customer was matched (account_number, email, phone, etc.)'
  },

  // URL details
  payment_link: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Flutterwave payment link/authorization URL'
  },

  redirect_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Redirect URL after payment'
  },

  // Response data
  gateway_response: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Response from Flutterwave gateway'
  },

  processor_response: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Detailed processor response'
  },

  // Timestamps
  initiated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When payment was completed'
  },

  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When inward transfer was processed'
  },

  webhook_processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When webhook was processed'
  },

  // Refund details
  refund_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Refund response data'
  },

  refund_date: {
    type: DataTypes.DATE,
    allowNull: true
  },

  refund_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  refund_amount: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: true,
    comment: 'Amount refunded'
  },

  // Fees
  fees: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: true,
    defaultValue: 0
  },

  // Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Custom metadata from request'
  },

  flutterwave_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Full Flutterwave response data'
  },

  // Error details
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for failure if status is FAILED'
  },

  // Audit fields
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'SYSTEM'
  },

  updated_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },

  // Version for optimistic locking
  version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },

  // Record status
  rec_st: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I', 'D']] // Active, Inactive, Deleted
    }
  },

  // Soft delete
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'FlutterwaveTransaction',
  tableName: 'flutterwave_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',

  // Hooks
  hooks: {
    beforeCreate: (transaction) => {
      if (!transaction.transaction_reference) {
        transaction.transaction_reference = `FLW-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      }
    },
    
    beforeUpdate: (transaction) => {
      // Update version on update
      transaction.version += 1;
    },

    afterUpdate: (transaction) => {
      // Log status changes
      if (transaction.changed('status')) {
        const oldStatus = transaction.previous('status');
        const newStatus = transaction.status;
        
        console.log(`Flutterwave Transaction ${transaction.transaction_reference} status changed from ${oldStatus} to ${newStatus}`);
      }
    }
  },

  // Indexes
  indexes: [
    {
      name: 'idx_flutterwave_transaction_reference',
      fields: ['transaction_reference']
    },
    {
      name: 'idx_flutterwave_flutterwave_reference',
      fields: ['flutterwave_reference']
    },
    {
      name: 'idx_flutterwave_email',
      fields: ['email']
    },
    {
      name: 'idx_flutterwave_status',
      fields: ['status']
    },
    {
      name: 'idx_flutterwave_customer_account',
      fields: ['customer_account']
    },
    {
      name: 'idx_flutterwave_created_at',
      fields: ['created_at']
    },
    {
      name: 'idx_flutterwave_paid_at',
      fields: ['paid_at']
    },
    {
      name: 'idx_flutterwave_webhook_processed',
      fields: ['webhook_processed_at']
    },
    {
      name: 'idx_flutterwave_rec_st',
      fields: ['rec_st']
    }
  ],

  // Scopes
  scopes: {
    active: {
      where: { rec_st: 'A' }
    },
    successful: {
      where: { status: 'SUCCESS' }
    },
    pending: {
      where: { 
        status: {
          [Op.in]: ['PENDING', 'PENDING_MATCHING', 'PROCESSING', 'AUTHENTICATING']
        }
      }
    },
    failed: {
      where: { status: 'FAILED' }
    },
    refunded: {
      where: { status: 'REFUNDED' }
    },
    today: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    },
    thisMonth: {
      where: {
        created_at: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    }
  },

  // Default scope
  defaultScope: {
    where: { rec_st: 'A' }
  }
});

// Static methods
FlutterwaveTransaction.findByReference = async function(reference) {
  return this.findOne({
    where: {
      [Op.or]: [
        { transaction_reference: reference },
        { flutterwave_reference: reference }
      ]
    }
  });
};

FlutterwaveTransaction.findByCustomerAccount = async function(accountNumber, options = {}) {
  return this.findAll({
    where: {
      customer_account: accountNumber
    },
    order: [['created_at', 'DESC']],
    ...options
  });
};

FlutterwaveTransaction.getPendingTransactions = async function(options = {}) {
  return this.scope('pending').findAll({
    where: {
      created_at: {
        [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    },
    ...options
  });
};

FlutterwaveTransaction.getUnprocessedWebhooks = async function(options = {}) {
  return this.findAll({
    where: {
      webhook_processed_at: null,
      status: {
        [Op.in]: ['SUCCESS', 'FAILED']
      }
    },
    ...options
  });
};

FlutterwaveTransaction.getTransactionStats = async function(startDate, endDate) {
  const where = {};
  
  if (startDate) {
    where.created_at = {
      [Op.gte]: new Date(startDate)
    };
  }
  
  if (endDate) {
    where.created_at = {
      ...where.created_at,
      [Op.lte]: new Date(endDate)
    };
  }

  const stats = await this.findAll({
    where,
    attributes: [
      'status',
      'currency',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount']
    ],
    group: ['status', 'currency']
  });

  return stats;
};

FlutterwaveTransaction.getRefundableTransactions = async function(options = {}) {
  return this.findAll({
    where: {
      status: 'SUCCESS',
      refund_data: null,
      amount: {
        [Op.gt]: 0
      }
    },
    ...options
  });
};

// Instance methods for status management
FlutterwaveTransaction.prototype.markAsSuccess = async function(additionalData = {}) {
  this.status = 'SUCCESS';
  this.paid_at = new Date();
  
  if (additionalData) {
    Object.assign(this, additionalData);
  }
  
  await this.save();
  return this;
};

FlutterwaveTransaction.prototype.markAsFailed = async function(reason, additionalData = {}) {
  this.status = 'FAILED';
  this.failure_reason = reason;
  
  if (additionalData) {
    Object.assign(this, additionalData);
  }
  
  await this.save();
  return this;
};

FlutterwaveTransaction.prototype.markAsRefunded = async function(refundData, additionalData = {}) {
  this.status = 'REFUNDED';
  this.refund_data = refundData;
  this.refund_date = new Date();
  
  if (additionalData) {
    Object.assign(this, additionalData);
  }
  
  await this.save();
  return this;
};

FlutterwaveTransaction.prototype.markAsProcessed = async function(inwardTransferId, additionalData = {}) {
  this.status = 'PROCESSING';
  this.inward_transfer_id = inwardTransferId;
  this.processed_at = new Date();
  
  if (additionalData) {
    Object.assign(this, additionalData);
  }
  
  await this.save();
  return this;
};

FlutterwaveTransaction.prototype.markWebhookProcessed = async function(additionalData = {}) {
  this.webhook_processed_at = new Date();
  
  if (additionalData) {
    Object.assign(this, additionalData);
  }
  
  await this.save();
  return this;
};

export default FlutterwaveTransaction;
