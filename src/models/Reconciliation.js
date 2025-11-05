import mongoose from 'mongoose';

const ReconciliationSchema = new mongoose.Schema({
  JOURNAL_ID: { 
    type: String, 
    required: true, 
    index: true,
    trim: true 
  },
  GL_ACCT_NO: { 
    type: String, 
    required: true, 
    index: true,
    trim: true,
    match: [/^\d+-\d+-\d+-\d+-\d+-\d+$/, 'Invalid GL Account Number format']
  },
  TRANSACTION_ID: { 
    type: Number, 
    required: true, 
    index: true 
  }, // From GLAccountTransaction
  EXTERNAL_REF: { 
    type: String, 
    trim: true 
  }, // Bank statement reference
  STATUS: { 
    type: String, 
    enum: ['Pending', 'Reconciled', 'Discrepancy'], 
    default: 'Pending' 
  },
  RECONCILED_AT: { 
    type: Date 
  },
  DISCREPANCY_REASON: { 
    type: String, 
    trim: true 
  },
  AMOUNT: { 
    type: Number, 
    required: true 
  }, // Store amount for verification
  CURRENCY_CODE: { 
    type: String, 
    default: 'NGN',
    trim: true,
    match: [/^[A-Z]{3}$/, 'Currency code must be a 3-letter ISO code']
  },
  organizationName: { 
    type: String, 
    required: true, 
    trim: true, 
    index: true 
  }, // Added to align with Branch context
  branchName: { 
    type: String, 
    required: true, 
    trim: true, 
    index: true 
  }, // Added to align with Branch context
  CREATED_AT: { 
    type: Date, 
    default: Date.now 
  },
  UPDATED_AT: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: { createdAt: 'CREATED_AT', updatedAt: 'UPDATED_AT' },
  collection: 'reconciliations'
});



// Prevent model overwrite by checking if model exists
const Reconciliation = mongoose.models.Reconciliation || mongoose.model('Reconciliation', ReconciliationSchema);

export default Reconciliation;