import mongoose from 'mongoose';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const BusinessRoleSchema = new mongoose.Schema({
  ROLE_NM: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true,
    uppercase: true,
    enum: {
      values: Object.values(ROLE_MAPPING).map(r => r.ROLE_NM.toUpperCase()),
      message: 'Invalid role name. Valid values: {VALUE}'
    },
    validate: {
      validator: function(v) {
        if (!this.ROLE_ID) return true;
        const expectedName = ROLE_MAPPING[this.ROLE_ID]?.ROLE_NM.toUpperCase();
        return expectedName === v.toUpperCase();
      },
      message: function(props) {
        const expectedName = ROLE_MAPPING[this.ROLE_ID]?.ROLE_NM.toUpperCase();
        return expectedName 
          ? `Role name '${props.value}' doesn't match role ID ${this.ROLE_ID}. Expected: ${expectedName}`
          : `Invalid ROLE_ID: ${this.ROLE_ID}`;
      }
    }
  },
  REC_ST: {
    type: String,
    required: [true, 'Record status is required'],
    enum: {
      values: ['Active', 'Deactivated'],
      message: 'Status must be either Active or Deactivated'
    },
    default: 'Active'
  },
  VERSION_NO: {
    type: Number,
    default: 1,
    min: [1, 'Version number cannot be less than 1']
  },
  USER_ID: {
    type: String,
    required: [true, 'User ID is required'],
    index: true,
    trim: true,
    uppercase: true
  },
  CREATE_DT: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  SYS_CREATE_TS: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  CREATED_BY: {
    type: String,
    required: [true, 'Creator user is required'],
    trim: true
  },
  CREATED_BY_ROLE: {
    type: String,
    default: 'Unknown',
    trim: true
  },
  ROW_TS: {
    type: Date,
    default: Date.now
  },
  ROLE_ID: {
    type: Number,
    required: [true, 'Role ID is required'],
    enum: {
      values: Object.keys(ROLE_MAPPING).map(Number),
      message: props => {
        const expectedName = ROLE_MAPPING[props.value]?.ROLE_NM;
        const currentName = props?.instance?.ROLE_NM;
        return expectedName
          ? `Role ID ${props.value} doesn't match role name ${currentName}. Expected: ${expectedName}`
          : `Invalid ROLE_ID: ${props.value}`;
      }
    },
    validate: {
      validator: function(v) {
        if (!this.ROLE_NM) return true;
        const expectedName = ROLE_MAPPING[v]?.ROLE_NM.toUpperCase();
        return expectedName === this.ROLE_NM.toUpperCase();
      },
      message: function(props) {
        const expectedName = ROLE_MAPPING[props.value]?.ROLE_NM;
        return expectedName
          ? `Role ID ${props.value} doesn't match role name ${this.ROLE_NM}. Expected: ${expectedName}`
          : `Invalid ROLE_ID: ${props.value}`;
      }
    },
    index: true
  },
  BUSINESS_UNIT: {
    type: String,
    required: [true, 'Business unit is required'],
    index: true,
    trim: true
  },
  BU_ID: {
    type: Number,
    required: [true, 'Business unit ID is required'],
    min: [1, 'Business unit ID must be positive']
  },
  SUPERVISOR_FG: {
    type: String,
    required: [true, 'Supervisor flag is required'],
    enum: {
      values: ['Y', 'N'],
      message: 'Supervisor flag must be either Y or N'
    },
    default: 'N',
    uppercase: true,
    set: function(v) {
      return v.toString().toUpperCase();
    }
  },
  ALLOW_TXN_POSTING_FG: {
    type: String,
    required: [true, 'Transaction posting flag is required'],
    enum: {
      values: ['Y', 'N'],
      message: 'Transaction posting flag must be either Y or N'
    },
    default: 'N',
    uppercase: true,
    set: function(v) {
      if (typeof v === 'boolean') return v ? 'Y' : 'N';
      if (typeof v === 'number') return v > 0 ? 'Y' : 'N';
      return v.toString().toUpperCase() === 'Y' ? 'Y' : 'N';
    }
  },
  LAST_UPDATED_BY: {
    type: String,
    trim: true
  },
  LAST_UPDATED_DT: {
    type: Date
  },
  ADMIN_OVERRIDE: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret._id;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
BusinessRoleSchema.index({ ROLE_ID: 1, BUSINESS_UNIT: 1 });
BusinessRoleSchema.index({ USER_ID: 1 });
BusinessRoleSchema.index({ BU_ID: 1 });
BusinessRoleSchema.index({ ALLOW_TXN_POSTING_FG: 1 });

// Virtual for role details
BusinessRoleSchema.virtual('roleDetails').get(function() {
  return ROLE_MAPPING[this.ROLE_ID] || null;
});

// Pre-save validation hook
BusinessRoleSchema.pre('save', function(next) {
  this.ROW_TS = new Date();
  
  if (this.isModified()) {
    this.LAST_UPDATED_DT = new Date();
  }
  
  if (this.isNew && ROLE_MAPPING[this.ROLE_ID]?.defaultTransactionPosting) {
    this.ALLOW_TXN_POSTING_FG = 'Y';
  }
  
  next();
});

// Pre-update hook
BusinessRoleSchema.pre('findOneAndUpdate', function(next) {
  this.set({ 
    LAST_UPDATED_DT: new Date(),
    ROW_TS: new Date() 
  });
  next();
});

const BusinessRole = mongoose.model('BusinessRole', BusinessRoleSchema);
export default BusinessRole;