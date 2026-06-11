// models/DebitCard.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const DebitCard = sequelize.define('DebitCard', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  customerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'Reference to customers table',
  },
  accountId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'Reference to customer_accounts.id',
  },
  cardPan: {
    type: DataTypes.STRING(19),
    allowNull: false,
    unique: true,
    comment: 'Masked PAN (first6+last4) or encrypted full PAN',
  },
  cardHolderName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Name on card',
  },
  expiryMonth: {
    type: DataTypes.STRING(2),
    allowNull: false,
    comment: 'MM',
  },
  expiryYear: {
    type: DataTypes.STRING(4),
    allowNull: false,
    comment: 'YYYY',
  },
  cvvHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Hashed CVV (never store plaintext)',
  },
  pinHash: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Hashed PIN for ATM/POS',
  },
  cardScheme: {
    type: DataTypes.ENUM('VERVE', 'MASTERCARD', 'VISA'),
    defaultValue: 'VERVE',
    comment: 'Card network',
  },
  cardType: {
    type: DataTypes.ENUM('PHYSICAL', 'VIRTUAL'),
    defaultValue: 'VIRTUAL',
    comment: 'Physical or virtual card',
  },
  cardStatus: {
    type: DataTypes.ENUM('ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED', 'ISSUED', 'PIN_PENDING'),
    defaultValue: 'ISSUED',
    comment: 'Current card status',
  },
  dailyLimit: {
    type: DataTypes.DECIMAL(20, 2),
    comment: 'Maximum spend per day in NGN',
  },
  perTransactionLimit: {
    type: DataTypes.DECIMAL(20, 2),
    comment: 'Maximum per transaction',
  },
  dailySpentToday: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    comment: 'Accumulated spend today (resets daily)',
  },
  lastResetDate: {
    type: DataTypes.DATEONLY,
    comment: 'Date when daily_spent_today was last reset',
  },
  isContactlessEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  cardBin: {
    type: DataTypes.STRING(6),
    allowNull: true,
    comment: 'First 6 digits (BIN)',
  },
  cardLast4: {
    type: DataTypes.STRING(4),
    allowNull: true,
    comment: 'Last 4 digits for display',
  },
  issuedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User who issued the card',
  },
  issuedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  activatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  blockedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  blockReason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // ✅ NEW: Reason for unblocking (optional)
 unblockReason: {
  type: DataTypes.STRING(255),
  allowNull: true,
  field: 'unblock_reason',
  comment: 'Reason for unblocking the card',
},
}, {
  tableName: 'debit_cards',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
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

// Instance method (unchanged)
DebitCard.prototype.isValidForTransaction = function(amount) {
  const now = new Date();
  const expiry = new Date(this.expiryYear, this.expiryMonth - 1, 1);
  if (expiry < now) return { valid: false, reason: 'Card expired' };
  if (this.cardStatus !== 'ACTIVE') return { valid: false, reason: `Card status is ${this.cardStatus}` };
  if (amount > parseFloat(this.perTransactionLimit)) return { valid: false, reason: 'Exceeds per-transaction limit' };
  
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

// Static helpers (unchanged)
DebitCard.findByCardPan = async function(pan) {
  return await this.findOne({ where: { cardPan: pan } });
};

DebitCard.findByCustomerId = async function(customerId) {
  return await this.findAll({ where: { customerId: customerId } });
};

export default DebitCard;