import mongoose from 'mongoose';

// Define the CustomerAccount schema
const customerAccountSchema = new mongoose.Schema({
    CUST_ID: { type: Number, required: true},
    ACCT_ID: { type: Number, required: true },
    ACCT_NO: { 
        type: String,  // Changed from Number to String
        required: true,
        trim: true
    },
    ACCT_NM: { type: String, required: true },
    BU_ID: { type: String, required: true },
    LEDGER_BAL: { type: Number, required: true },
    CLEARED_BAL: { type: Number, required: true },
    AVAILABLE_BALANCE: { type: Number, required: true },
    ACCOUNT_TYPE: {
        type: String,
        required: true,
        enum: ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'LOAN', 'CREDIT_CARD']
    },
    PRODUCT_DESC: { type: String, required: true },
   REC_ST: {
  type: String,
  enum: ['Active', 'Dormant', 'Suspended', 'Closed', 'Inactive', 'Locked', 'Cancelled', 'Blocked', 'Pending', 'Frozen', 'Overdue'],
  default: 'Active',
  required: true,
  set: (val) => val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : val
},



     lastActivityDate: { type: Date, default: Date.now },
    CREATED_AT: { type: Date, default: Date.now },
    UPDATED_AT: { type: Date, default: Date.now },
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// West African Time (WAT) formatting function
function formatDateToWAT(date) {
    if (!date) return null;
    
    // Convert to West African Time (UTC+1)
    const watDate = new Date(date);
    watDate.setHours(watDate.getHours() + 1); // Add 1 hour for WAT
    
    const options = {
        timeZone: 'Africa/Lagos', // Nigeria is in WAT timezone
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    };
    
    return watDate.toLocaleString('en-US', options);
}

// Add virtual fields with WAT formatting
customerAccountSchema.virtual('formattedCreatedAt').get(function() {
    return formatDateToWAT(this.CREATED_AT);
});

customerAccountSchema.virtual('formattedUpdatedAt').get(function() {
    return formatDateToWAT(this.UPDATED_AT);
});

customerAccountSchema.virtual('formattedLastActivity').get(function() {
    return this.lastActivityDate ? formatDateToWAT(this.lastActivityDate) : null;
});

// Add virtual for time only (04:02:00 PM format)
customerAccountSchema.virtual('createdTime').get(function() {
    if (!this.CREATED_AT) return null;
    return new Date(this.CREATED_AT).toLocaleString('en-US', {
        timeZone: 'Africa/Lagos',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
});

const CustomerAccount = mongoose.models.CustomerAccount || 
                       mongoose.model('CustomerAccount', customerAccountSchema);

export default CustomerAccount;