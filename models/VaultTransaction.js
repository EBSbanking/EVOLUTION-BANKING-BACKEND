// models/VaultTransaction.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const VaultTransactionSchema = new Schema({
  // Reference to base transaction
  TRANSACTION_ID: { 
    type: Number, 
    required: true, 
    ref: 'Transaction',
    unique: true 
  },
  
  // Vault-specific fields
  VAULT_DRAWER_ID: { 
    type: Number, 
    required: true,
    ref: 'Drawer' 
  },
  TELLER_DRAWER_ID: { 
    type: Number, 
    required: true,
    ref: 'Drawer' 
  },
  
  // Vault transaction specifics
  IS_VAULT_ISSUANCE: { 
    type: Boolean, 
    required: true 
  }, // true = vault to teller, false = teller to vault
  VAULT_TRANSACTION_CATEGORY: { 
    type: String,
    enum: ['CASH_ISSUANCE', 'CASH_RETURN', 'CASH_ADJUSTMENT', 'CASH_TRANSFER'],
    required: true 
  },
  
  // Vault authorization levels
  VAULT_AUTHORIZATION_REQUIRED: { 
    type: Boolean, 
    default: true 
  },
  VAULT_AUTHORIZED_BY: { 
    type: String, 
    maxlength: 100 
  },
  VAULT_AUTHORIZATION_DT: { 
    type: Date 
  },
  
  // Cash management
  CASH_COUNT_VERIFIED: { 
    type: Boolean, 
    default: false 
  },
  CASH_COUNT_VERIFIED_BY: { 
    type: String, 
    maxlength: 100 
  },
  CASH_COUNT_VERIFIED_DT: { 
    type: Date 
  },
  
  // Security
  IS_HIGH_VALUE_TRANSACTION: { 
    type: Boolean, 
    default: false 
  },
  HIGH_VALUE_THRESHOLD: { 
    type: Schema.Types.Decimal128, 
    default: mongoose.Types.Decimal128.fromString('500000.00') // 500,000 NGN
  },
  
  // Additional vault controls
  REQUIRES_DUAL_CONTROL: { 
    type: Boolean, 
    default: true 
  },
  DUAL_CONTROL_USER_ID: { 
    type: Number 
  },
  DUAL_CONTROL_USER_NAME: { 
    type: String, 
    maxlength: 100 
  },
  
  // Vault session tracking
  VAULT_SESSION_ID: { 
    type: String, 
    maxlength: 50 
  },
  
  // Audit fields
  CREATED_BY: { 
    type: String, 
    required: true, 
    maxlength: 24 
  },
  CREATE_DT: { 
    type: Date, 
    default: Date.now 
  },
  MODIFIED_BY: { 
    type: String, 
    maxlength: 24 
  },
  MODIFY_DT: { 
    type: Date 
  }

}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      if (ret.HIGH_VALUE_THRESHOLD) ret.HIGH_VALUE_THRESHOLD = parseFloat(ret.HIGH_VALUE_THRESHOLD.toString());
      return ret;
    }
  }
});

// Indexes
VaultTransactionSchema.index({ VAULT_DRAWER_ID: 1, CREATE_DT: -1 });
VaultTransactionSchema.index({ TELLER_DRAWER_ID: 1, CREATE_DT: -1 });
VaultTransactionSchema.index({ IS_VAULT_ISSUANCE: 1, TRANSACTION_STATUS: 1 });

// Virtuals
VaultTransactionSchema.virtual('isHighValue').get(function() {
  const transaction = this.parent();
  if (!transaction) return false;
  
  const amount = parseFloat(transaction.TRANSACTION_AMOUNT.toString());
  const threshold = parseFloat(this.HIGH_VALUE_THRESHOLD.toString());
  return amount >= threshold;
});

VaultTransactionSchema.virtual('requiresDualControl').get(function() {
  return this.REQUIRES_DUAL_CONTROL || this.isHighValue;
});

// Methods
VaultTransactionSchema.methods.canProcessVaultTransaction = function() {
  const errors = [];
  
  if (this.REQUIRES_DUAL_CONTROL && !this.DUAL_CONTROL_USER_ID) {
    errors.push('Dual control required but not assigned');
  }
  
  if (this.VAULT_AUTHORIZATION_REQUIRED && !this.VAULT_AUTHORIZED_BY) {
    errors.push('Vault authorization required but not provided');
  }
  
  if (this.CASH_COUNT_VERIFIED === false) {
    errors.push('Cash count verification pending');
  }
  
  return {
    canProcess: errors.length === 0,
    errors: errors
  };
};

const VaultTransaction = mongoose.model('VaultTransaction', VaultTransactionSchema);

export default VaultTransaction;