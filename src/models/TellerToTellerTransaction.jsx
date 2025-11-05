// models/TellerToTellerTransaction.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const TellerToTellerTransactionSchema = new Schema({
  // Reference to base transaction
  TRANSACTION_ID: { 
    type: Number, 
    required: true, 
    ref: 'Transaction',
    unique: true 
  },
  
  // Teller-to-teller specific fields
  SOURCE_TELLER_ID: { 
    type: Number, 
    required: true 
  },
  SOURCE_TELLER_NAME: { 
    type: String, 
    required: true, 
    maxlength: 100 
  },
  DESTINATION_TELLER_ID: { 
    type: Number, 
    required: true 
  },
  DESTINATION_TELLER_NAME: { 
    type: String, 
    required: true, 
    maxlength: 100 
  },
  
  // Transfer details
  TRANSFER_REASON: { 
    type: String,
    enum: [
      'BALANCE_ADJUSTMENT', 
      'CASH_REQUEST', 
      'OVERCASH', 
      'SHORTCASH', 
      'CUSTOMER_SERVICE',
      'OPERATIONAL_NEED'
    ],
    required: true 
  },
  CUSTOM_REFERENCE: { 
    type: String, 
    maxlength: 100 
  },
  
  // Authorization for teller transfers
  SUPERVISOR_AUTHORIZATION_REQUIRED: { 
    type: Boolean, 
    default: true 
  },
  SUPERVISOR_AUTHORIZED_BY: { 
    type: String, 
    maxlength: 100 
  },
  SUPERVISOR_AUTHORIZATION_DT: { 
    type: Date 
  },
  
  // Recipient acknowledgment
  RECIPIENT_ACKNOWLEDGED: { 
    type: Boolean, 
    default: false 
  },
  RECIPIENT_ACKNOWLEDGED_BY: { 
    type: String, 
    maxlength: 100 
  },
  RECIPIENT_ACKNOWLEDGED_DT: { 
    type: Date 
  },
  
  // Limits and controls
  IS_WITHIN_SAME_BRANCH: { 
    type: Boolean, 
    default: true 
  },
  INTER_BRANCH_TRANSFER: { 
    type: Boolean, 
    default: false 
  },
  DESTINATION_BRANCH_ID: { 
    type: Number 
  },
  
  // Dispute resolution
  HAS_DISPUTE: { 
    type: Boolean, 
    default: false 
  },
  DISPUTE_REASON: { 
    type: String, 
    maxlength: 500 
  },
  DISPUTE_RESOLVED: { 
    type: Boolean, 
    default: false 
  },
  DISPUTE_RESOLVED_BY: { 
    type: String, 
    maxlength: 100 
  },
  DISPUTE_RESOLVED_DT: { 
    type: Date 
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
  timestamps: true
});

// Indexes
TellerToTellerTransactionSchema.index({ SOURCE_TELLER_ID: 1, CREATE_DT: -1 });
TellerToTellerTransactionSchema.index({ DESTINATION_TELLER_ID: 1, CREATE_DT: -1 });
TellerToTellerTransactionSchema.index({ TRANSFER_REASON: 1 });
TellerToTellerTransactionSchema.index({ INTER_BRANCH_TRANSFER: 1 });

// Virtuals
TellerToTellerTransactionSchema.virtual('requiresSupervisorAuth').get(function() {
  const transaction = this.parent();
  if (!transaction) return true;
  
  const amount = parseFloat(transaction.TRANSACTION_AMOUNT.toString());
  return amount > 50000; // Require supervisor auth for transfers above 50,000 NGN
});

TellerToTellerTransactionSchema.virtual('canCompleteTransfer').get(function() {
  if (this.SUPERVISOR_AUTHORIZATION_REQUIRED && !this.SUPERVISOR_AUTHORIZED_BY) {
    return false;
  }
  
  if (!this.RECIPIENT_ACKNOWLEDGED) {
    return false;
  }
  
  return true;
});

// Methods
TellerToTellerTransactionSchema.methods.acknowledgeReceipt = function(recipientName) {
  this.RECIPIENT_ACKNOWLEDGED = true;
  this.RECIPIENT_ACKNOWLEDGED_BY = recipientName;
  this.RECIPIENT_ACKNOWLEDGED_DT = new Date();
};

TellerToTellerTransactionSchema.methods.raiseDispute = function(reason) {
  this.HAS_DISPUTE = true;
  this.DISPUTE_REASON = reason;
  this.DISPUTE_RESOLVED = false;
};

TellerToTellerTransactionSchema.methods.resolveDispute = function(resolvedBy, resolutionNotes) {
  this.HAS_DISPUTE = false;
  this.DISPUTE_RESOLVED = true;
  this.DISPUTE_RESOLVED_BY = resolvedBy;
  this.DISPUTE_RESOLVED_DT = new Date();
  this.DISPUTE_REASON = resolutionNotes;
};

const TellerToTellerTransaction = mongoose.model('TellerToTellerTransaction', TellerToTellerTransactionSchema);

export default TellerToTellerTransaction;