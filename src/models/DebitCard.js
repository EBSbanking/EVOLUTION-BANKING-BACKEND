// src/models/DebitCard.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const DebitCard = sequelize.define('DebitCard', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  customerId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'customer_id',
    comment: 'Reference to customers table (can be number or string like "0100000004")',
  },
  accountId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'account_id',
    comment: 'Reference to customer_accounts.id',
  },
  cardPan: {
    type: DataTypes.STRING(19),
    allowNull: false,
    unique: true,
    field: 'card_pan',
    comment: 'Masked PAN (first6+last4) or encrypted full PAN',
  },
  cardHolderName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'card_holder_name',
    comment: 'Name on card',
  },
  expiryMonth: {
    type: DataTypes.STRING(2),
    allowNull: false,
    field: 'expiry_month',
    comment: 'MM',
  },
  expiryYear: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'expiry_year',
    comment: 'YYYY',
  },
  cvvHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'cvv_hash',
    comment: 'Hashed CVV (never store plaintext)',
  },
  encryptedCvv: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'encrypted_cvv',
    comment: 'Encrypted CVV for Flutterwave payments (AES-256-CBC)',
  },
  cvvNonce: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'cvv_nonce',
    comment: 'Nonce used for CVV encryption',
  },
  pinHash: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'pin_hash',
    comment: 'Hashed PIN for ATM/POS',
  },
  cardScheme: {
    type: DataTypes.ENUM('VERVE', 'MASTERCARD', 'VISA', 'AMEX', 'DISCOVER'),
    defaultValue: 'VERVE',
    field: 'card_scheme',
    comment: 'Card network',
  },
  cardType: {
    type: DataTypes.ENUM('PHYSICAL', 'VIRTUAL'),
    defaultValue: 'VIRTUAL',
    field: 'card_type',
    comment: 'Physical or virtual card',
  },
  // ✅ FIXED: Added 'PENDING' to cardStatus ENUM
  cardStatus: {
    type: DataTypes.ENUM('PENDING', 'ISSUED', 'ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED', 'PIN_PENDING'),
    defaultValue: 'PENDING',  // ✅ Changed from 'ISSUED' to 'PENDING'
    field: 'card_status',
    comment: 'Current card status: PENDING, ISSUED, ACTIVE, BLOCKED, EXPIRED, CANCELLED, PIN_PENDING',
  },
  dailyLimit: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'daily_limit',
    comment: 'Maximum spend per day in NGN',
  },
  perTransactionLimit: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'per_transaction_limit',
    comment: 'Maximum per transaction',
  },
  dailySpentToday: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    field: 'daily_spent_today',
    comment: 'Accumulated spend today (resets daily)',
  },
  lastResetDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'last_reset_date',
    comment: 'Date when daily_spent_today was last reset',
  },
  isContactlessEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_contactless_enabled',
  },
  cardBin: {
    type: DataTypes.STRING(6),
    allowNull: true,
    field: 'card_bin',
    comment: 'First 6 digits (BIN)',
  },
  cardLast4: {
    type: DataTypes.STRING(4),
    allowNull: true,
    field: 'card_last4',
    comment: 'Last 4 digits for display',
  },
  binBankName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'bin_bank_name',
    comment: 'Bank name from BIN lookup',
  },
  binCountry: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'bin_country',
    comment: 'Country from BIN lookup',
  },
  binNetwork: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'bin_network',
    comment: 'Network (VERVE, VISA, MASTERCARD) from BIN lookup',
  },
  binCardType: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'bin_card_type',
    comment: 'Card type from BIN lookup',
  },
  flutterwaveEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'flutterwave_enabled',
    comment: 'Whether card can be used for Flutterwave payments',
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at',
    comment: 'Last time card was used for any transaction',
  },
  issuedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'issued_by',
    comment: 'User who issued the card',
  },
  issuedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'issued_at',
  },
  activatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'activated_at',
  },
  blockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'blocked_at',
  },
  blockReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'block_reason',
  },
  unblockReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'unblock_reason',
    comment: 'Reason for unblocking the card',
  },
  approvalRequestId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approval_request_id',
    comment: 'Reference to the approval request that created this card',
  },
}, {
  tableName: 'debit_cards',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  hooks: {
    beforeCreate: (card) => {
      if (card.cardPan && card.cardPan.length >= 16) {
        card.cardBin = card.cardPan.substring(0, 6);
        card.cardLast4 = card.cardPan.slice(-4);
      }
    },
  },
});

// ================================================================
// ✅ INSTANCE METHODS
// ================================================================

/**
 * Check if card is valid for a transaction
 */
DebitCard.prototype.isValidForTransaction = function(amount) {
  const now = new Date();
  const expiry = new Date(this.expiryYear, this.expiryMonth - 1, 1);
  
  if (expiry < now) {
    return { valid: false, reason: 'Card expired' };
  }
  
  if (this.cardStatus !== 'ACTIVE') {
    return { valid: false, reason: `Card status is ${this.cardStatus}` };
  }
  
  if (this.dailyLimit !== null && amount > parseFloat(this.dailyLimit)) {
    return { valid: false, reason: 'Amount exceeds daily limit' };
  }
  
  if (this.perTransactionLimit !== null && amount > parseFloat(this.perTransactionLimit)) {
    return { valid: false, reason: 'Exceeds per-transaction limit' };
  }
  
  const today = now.toISOString().slice(0, 10);
  if (this.lastResetDate !== today) {
    this.dailySpentToday = 0;
    this.lastResetDate = today;
  }
  
  if ((this.dailySpentToday + amount) > parseFloat(this.dailyLimit)) {
    return { valid: false, reason: 'Daily limit exceeded' };
  }
  
  return { valid: true };
};

/**
 * Check if card is valid for Flutterwave payments
 */
DebitCard.prototype.isValidForFlutterwave = function() {
  const now = new Date();
  const expiry = new Date(this.expiryYear, this.expiryMonth - 1, 1);
  
  if (!this.flutterwaveEnabled) {
    return { valid: false, reason: 'Card not enabled for Flutterwave payments' };
  }
  
  if (expiry < now) {
    return { valid: false, reason: 'Card expired' };
  }
  
  if (this.cardStatus !== 'ACTIVE' && this.cardStatus !== 'ISSUED') {
    return { valid: false, reason: `Card status is ${this.cardStatus}` };
  }
  
  if (!this.encryptedCvv) {
    return { valid: false, reason: 'CVV not available for Flutterwave payments' };
  }
  
  return { valid: true };
};

/**
 * Get masked card number for display
 */
DebitCard.prototype.getMaskedPan = function() {
  if (this.cardLast4) {
    return `**** **** **** ${this.cardLast4}`;
  }
  if (this.cardPan && this.cardPan.length >= 16) {
    return `**** **** **** ${this.cardPan.slice(-4)}`;
  }
  return '**** **** **** ****';
};

/**
 * Get card expiry date in MM/YYYY format
 */
DebitCard.prototype.getExpiryDate = function() {
  return `${this.expiryMonth}/${this.expiryYear}`;
};

/**
 * Check if card is expired
 */
DebitCard.prototype.isExpired = function() {
  const now = new Date();
  const expiry = new Date(this.expiryYear, this.expiryMonth - 1, 1);
  return expiry < now;
};

/**
 * Check if card is active
 */
DebitCard.prototype.isActive = function() {
  return this.cardStatus === 'ACTIVE' || this.cardStatus === 'ISSUED';
};

/**
 * Check if card can be used for online payments
 */
DebitCard.prototype.canUseOnline = function() {
  return this.isActive() && !this.isExpired() && this.flutterwaveEnabled;
};

/**
 * Get card summary for display
 */
DebitCard.prototype.getSummary = function() {
  return {
    id: this.id,
    maskedPan: this.getMaskedPan(),
    expiry: this.getExpiryDate(),
    type: this.cardType,
    status: this.cardStatus,
    scheme: this.cardScheme,
    last4: this.cardLast4,
    flutterwaveEnabled: this.flutterwaveEnabled,
    bankName: this.binBankName,
    network: this.binNetwork,
    issuedAt: this.issuedAt,
    lastUsedAt: this.lastUsedAt
  };
};

// ================================================================
// ✅ STATIC METHODS
// ================================================================

/**
 * Find card by PAN
 */
DebitCard.findByCardPan = async function(pan) {
  return await this.findOne({ where: { cardPan: pan } });
};

/**
 * Find all cards for a customer (supports both string and number customerId)
 */
DebitCard.findByCustomerId = async function(customerId) {
  return await this.findAll({ 
    where: { customerId: String(customerId) } 
  });
};

/**
 * Find all cards enabled for Flutterwave
 */
DebitCard.findFlutterwaveEnabled = async function(customerId = null) {
  const where = { flutterwaveEnabled: true };
  if (customerId) {
    where.customerId = String(customerId);
  }
  return await this.findAll({ where });
};

/**
 * Find active cards (ISSUED or ACTIVE)
 */
DebitCard.findActiveCards = async function(customerId = null) {
  const where = {
    cardStatus: {
      [DataTypes.Op.in]: ['ACTIVE', 'ISSUED']
    }
  };
  if (customerId) {
    where.customerId = String(customerId);
  }
  return await this.findAll({ where });
};

/**
 * Find pending cards (PENDING status)
 */
DebitCard.findPendingCards = async function(customerId = null) {
  const where = {
    cardStatus: 'PENDING'
  };
  if (customerId) {
    where.customerId = String(customerId);
  }
  return await this.findAll({ where });
};

/**
 * Find expired cards
 */
DebitCard.findExpiredCards = async function() {
  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
  
  return await this.findAll({
    where: {
      [DataTypes.Op.or]: [
        {
          expiryYear: {
            [DataTypes.Op.lt]: currentYear
          }
        },
        {
          expiryYear: currentYear,
          expiryMonth: {
            [DataTypes.Op.lt]: currentMonth
          }
        }
      ]
    }
  });
};

/**
 * Find cards by bank name (BIN lookup)
 */
DebitCard.findByBankName = async function(bankName) {
  return await this.findAll({
    where: {
      binBankName: {
        [DataTypes.Op.like]: `%${bankName}%`
      }
    }
  });
};

/**
 * Find cards by network
 */
DebitCard.findByNetwork = async function(network) {
  return await this.findAll({
    where: { binNetwork: network }
  });
};

/**
 * Get card statistics
 */
DebitCard.getStatistics = async function() {
  const stats = await this.findAll({
    attributes: [
      'cardStatus',
      [DataTypes.fn('COUNT', DataTypes.col('id')), 'count'],
      [DataTypes.fn('SUM', DataTypes.col('dailySpentToday')), 'totalDailySpent']
    ],
    group: ['cardStatus']
  });
  
  const flutterwaveStats = await this.findAll({
    where: { flutterwaveEnabled: true },
    attributes: [
      [DataTypes.fn('COUNT', DataTypes.col('id')), 'count']
    ]
  });
  
  return {
    byStatus: stats,
    flutterwaveEnabled: flutterwaveStats.length > 0 ? flutterwaveStats[0].get('count') : 0,
    total: await this.count()
  };
};

// ================================================================
// ✅ EXPORT
// ================================================================

export default DebitCard;
