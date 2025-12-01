import mongoose from 'mongoose';
import Drawer from './Drawer.js';

const { Schema } = mongoose;

// =============================================
// VALIDATION SCHEMAS
// =============================================

const createVaultSchema = {
  VAULT_ID: { type: 'number', required: true },
  VAULT_CD: { type: 'string', required: true, maxLength: 20 },
  VAULT_NM: { type: 'string', required: true, maxLength: 100 },
  VAULT_CATEGORY: { type: 'string', enum: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'] },
  SECURITY_LEVEL: { type: 'string', enum: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'] },
  VAULT_CAPACITY: { type: 'string', pattern: /^\d+(\.\d{1,2})?$/ },
  BRANCH_CODE: { type: 'string', maxLength: 10 },
  LOCATION_CODE: { type: 'string', maxLength: 20 },
  CREATED_BY: { type: 'string', required: true, maxLength: 24 },
  DRAWER_ID: { type: 'number', required: true }
};

const updateVaultSchema = {
  VAULT_NM: { type: 'string', maxLength: 100 },
  VAULT_CATEGORY: { type: 'string', enum: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'] },
  SECURITY_LEVEL: { type: 'string', enum: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'] },
  VAULT_CAPACITY: { type: 'string', pattern: /^\d+(\.\d{1,2})?$/ },
  VAULT_STATUS: { type: 'string', enum: ['OPERATIONAL', 'MAINTENANCE', 'EMERGENCY_LOCKDOWN', 'INVENTORY', 'DECOMMISSIONED'] },
  UPDATED_BY: { type: 'string', required: true, maxLength: 24 }
};

const authorizePersonnelSchema = {
  user_id: { type: 'string', required: true },
  user_name: { type: 'string', required: true },
  user_role: { type: 'string', required: true, enum: ['VAULT_MANAGER', 'SUPERVISOR', 'TELLER', 'CASH_OFFICER', 'AUDITOR', 'BRANCH_MANAGER', 'HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR'] },
  authorized_by: { type: 'string', required: true, maxLength: 24 },
  access_level: { type: 'string', enum: ['FULL', 'LIMITED', 'VIEW_ONLY', 'EMERGENCY'] },
  notes: { type: 'string', maxLength: 500 }
};

const approvalRequestSchema = {
  transaction_type: { type: 'string', required: true, enum: ['WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'ADJUSTMENT', 'ACCESS_REQUEST'] },
  amount: { type: 'string', required: true, pattern: /^\d+(\.\d{1,2})?$/ },
  requested_by: { type: 'string', required: true },
  requested_by_role: { type: 'string', required: true },
  urgency: { type: 'string', enum: ['NORMAL', 'HIGH', 'EMERGENCY'] }
};

const approveRequestSchema = {
  approver_id: { type: 'string', required: true },
  approver_name: { type: 'string', required: true },
  approver_role: { type: 'string', required: true },
  notes: { type: 'string', maxLength: 500 }
};

const maintenanceSchema = {
  maintenance_type: { type: 'string', required: true, enum: ['ROUTINE', 'EMERGENCY', 'UPGRADE', 'INSPECTION'] },
  performed_by: { type: 'string', required: true },
  description: { type: 'string', required: true },
  cost: { type: 'string', required: true, pattern: /^\d+(\.\d{1,2})?$/ },
  duration_hours: { type: 'number', required: true },
  approved_by: { type: 'string' }
};

// =============================================
// VALIDATION FUNCTIONS
// =============================================

const validateVaultData = (data, schema) => {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    
    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }
    
    // Skip validation if field is not required and not provided
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }
    
    // Type validation
    if (rules.type && value !== undefined && value !== null) {
      switch (rules.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${field} must be a valid number`);
          }
          break;
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${field} must be a boolean`);
          }
          break;
      }
    }
    
    // String length validation
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push(`${field} must not exceed ${rules.maxLength} characters`);
    }
    
    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
    
    // Pattern validation
    if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
      errors.push(`${field} must match pattern: ${rules.pattern}`);
    }
  }
  
  return errors;
};

// =============================================
// VAULT SCHEMA DEFINITION
// =============================================

const VaultSchema = new Schema({
  // =============================================
  // VAULT-SPECIFIC IDENTIFICATION
  // =============================================
  VAULT_ID: {
    type: Number,
    required: [true, 'VAULT_ID is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return Number.isInteger(v) && v > 0;
      },
      message: 'VAULT_ID must be a positive integer'
    }
  },
  VAULT_CD: {
    type: String,
    required: [true, 'VAULT_CD is required'],
    maxlength: [20, 'VAULT_CD cannot exceed 20 characters'],
    unique: true
  },
  VAULT_NM: {
    type: String,
    required: [true, 'VAULT_NM is required'],
    maxlength: [100, 'VAULT_NM cannot exceed 100 characters'],
    trim: true
  },
  
  // Reference to parent drawer using DRAWER_ID (business key) instead of ObjectId
  DRAWER_ID: {
    type: Number,
    required: [true, 'DRAWER_ID is required'],
    validate: {
      validator: async function(v) {
        const drawer = await mongoose.model('Drawer').findOne({ DRAWER_ID: v });
        return drawer !== null;
      },
      message: 'Referenced drawer does not exist'
    }
  },

  // Keep the populated drawer reference for easy access
  DRAWER_REF: {
    type: Schema.Types.ObjectId,
    ref: 'Drawer'
  },

  // =============================================
  // VAULT CLASSIFICATION & SECURITY
  // =============================================
  VAULT_CATEGORY: {
    type: String,
    required: [true, 'VAULT_CATEGORY is required'],
    enum: {
      values: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'],
      message: 'VAULT_CATEGORY must be one of: MAIN_VAULT, BRANCH_VAULT, TEMPORARY_VAULT, CASH_VAULT, BULLION_VAULT, HIGH_SECURITY_VAULT'
    },
    default: 'BRANCH_VAULT'
  },
  
  SECURITY_LEVEL: {
    type: String,
    required: [true, 'SECURITY_LEVEL is required'],
    enum: {
      values: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4'],
      message: 'SECURITY_LEVEL must be one of: LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4'
    },
    default: 'LEVEL_2'
  },
  
  SECURITY_FEATURES: [{
    feature: {
      type: String,
      required: [true, 'Security feature name is required'],
      enum: {
        values: ['BIOMETRIC', 'DUAL_CONTROL', 'TIME_LOCK', 'MOTION_SENSORS', 'CAMERAS', 'ALARM_SYSTEM', 'PRESSURE_SENSORS'],
        message: 'Security feature must be one of: BIOMETRIC, DUAL_CONTROL, TIME_LOCK, MOTION_SENSORS, CAMERAS, ALARM_SYSTEM, PRESSURE_SENSORS'
      }
    },
    is_active: {
      type: Boolean,
      default: true
    },
    last_maintenance: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v <= new Date();
        },
        message: 'Last maintenance date cannot be in the future'
      }
    },
    next_maintenance: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Next maintenance date must be in the future'
      }
    }
  }],

  REQUIRES_DUAL_CONTROL: {
    type: Boolean,
    default: true
  },
  
  MIN_AUTHORIZED_PERSONS: {
    type: Number,
    default: 2,
    min: [1, 'Minimum authorized persons cannot be less than 1'],
    max: [5, 'Minimum authorized persons cannot exceed 5'],
    validate: {
      validator: function(v) {
        return this.MAX_AUTHORIZED_PERSONS >= v;
      },
      message: 'MIN_AUTHORIZED_PERSONS cannot be greater than MAX_AUTHORIZED_PERSONS'
    }
  },
  
  MAX_AUTHORIZED_PERSONS: {
    type: Number,
    default: 4,
    min: [2, 'Maximum authorized persons cannot be less than 2'],
    max: [10, 'Maximum authorized persons cannot exceed 10'],
    validate: {
      validator: function(v) {
        return this.MIN_AUTHORIZED_PERSONS <= v;
      },
      message: 'MAX_AUTHORIZED_PERSONS cannot be less than MIN_AUTHORIZED_PERSONS'
    }
  },

  // =============================================
  // PHYSICAL CHARACTERISTICS
  // =============================================
  VAULT_CAPACITY: {
    type: Schema.Types.Decimal128,
    required: [true, 'VAULT_CAPACITY is required'],
    default: mongoose.Types.Decimal128.fromString('10000000.00'),
    validate: {
      validator: function(v) {
        const capacity = parseFloat(v.toString());
        return capacity >= 0;
      },
      message: 'VAULT_CAPACITY must be a non-negative number'
    }
  },
  
  PHYSICAL_CAPACITY: {
    width: { 
      type: Number,
      min: [0, 'Width must be a positive number']
    },
    height: { 
      type: Number,
      min: [0, 'Height must be a positive number']
    },
    depth: { 
      type: Number,
      min: [0, 'Depth must be a positive number']
    },
    volume: { 
      type: Number,
      min: [0, 'Volume must be a positive number']
    }
  },
  
  // =============================================
  // FIXED STORAGE_COMPARTMENTS STRUCTURE
  // =============================================
  STORAGE_COMPARTMENTS: {
    total_compartments: { 
      type: Number, 
      default: 10,
      min: [1, 'Total compartments must be at least 1']
    },
    available_compartments: { 
      type: Number, 
      default: 10,
      min: [0, 'Available compartments cannot be negative']
    },
    compartment_details: {
      type: [{
        compartment_id: { 
          type: String, 
          required: [true, 'Compartment ID is required'],
          default: "COMP-001"
        },
        compartment_type: { 
          type: String, 
          enum: {
            values: ['CASH', 'DOCUMENTS', 'VALUABLES', 'BULLION', 'CURRENCY'],
            message: 'Compartment type must be one of: CASH, DOCUMENTS, VALUABLES, BULLION, CURRENCY'
          },
          default: 'CASH'
        },
        capacity: {
          type: Schema.Types.Decimal128,
          default: mongoose.Types.Decimal128.fromString("1000000.00"),
          validate: {
            validator: function(v) {
              return !v || parseFloat(v.toString()) >= 0;
            },
            message: 'Compartment capacity must be a non-negative number'
          }
        },
        current_balance: {
          type: Schema.Types.Decimal128,
          default: mongoose.Types.Decimal128.fromString("0.00"),
          validate: {
            validator: function(v) {
              return !v || parseFloat(v.toString()) >= 0;
            },
            message: 'Current balance must be a non-negative number'
          }
        },
        is_locked: { 
          type: Boolean, 
          default: false 
        },
        assigned_to: { 
          type: String,
          maxlength: [24, 'Assigned to cannot exceed 24 characters'],
          default: ""
        }
      }],
      default: []
    }
  },

  // =============================================
  // ACCESS CONTROL & AUTHORIZATION
  // =============================================
  AUTHORIZED_PERSONNEL: [{
    user_id: { 
      type: String, 
      required: [true, 'User ID is required'],
      maxlength: [24, 'User ID cannot exceed 24 characters']
    },
    user_name: { 
      type: String, 
      required: [true, 'User name is required'],
      maxlength: [100, 'User name cannot exceed 100 characters'],
      trim: true
    },
    user_role: { 
      type: String, 
      required: [true, 'User role is required'],
      enum: {
        values: ['VAULT_MANAGER', 'SUPERVISOR', 'TELLER', 'CASH_OFFICER', 'AUDITOR', 'BRANCH_MANAGER', 'HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR'],
        message: 'User role must be one of: VAULT_MANAGER, SUPERVISOR, TELLER, CASH_OFFICER, AUDITOR, BRANCH_MANAGER, HEAD_TELLER, BRANCH_OFFICER_SUPERVISOR'
      }
    },
    access_level: {
      type: String,
      enum: {
        values: ['FULL', 'LIMITED', 'VIEW_ONLY', 'EMERGENCY'],
        message: 'Access level must be one of: FULL, LIMITED, VIEW_ONLY, EMERGENCY'
      },
      default: 'LIMITED'
    },
    authorization_start: { 
      type: Date, 
      required: [true, 'Authorization start date is required'],
      validate: {
        validator: function(v) {
          return v <= new Date();
        },
        message: 'Authorization start date cannot be in the future'
      }
    },
    authorization_end: { 
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > this.authorization_start;
        },
        message: 'Authorization end date must be after start date'
      }
    },
    is_active: { 
      type: Boolean, 
      default: true 
    },
    authorized_by: { 
      type: String, 
      required: [true, 'Authorized by is required'],
      maxlength: [24, 'Authorized by cannot exceed 24 characters']
    },
    authorization_notes: { 
      type: String, 
      maxlength: [500, 'Authorization notes cannot exceed 500 characters'],
      trim: true
    }
  }],

  // =============================================
  // ROLE-BASED ACCESS CONTROL
  // =============================================
  ROLE_ACCESS_MATRIX: {
    BRANCH_MANAGER: {
      can_authorize_personnel: { type: Boolean, default: true },
      can_override_limits: { type: Boolean, default: true },
      can_force_open: { type: Boolean, default: true },
      can_view_audit_logs: { type: Boolean, default: true },
      can_approve_large_transactions: { type: Boolean, default: true },
      max_approval_amount: {
        type: Schema.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('5000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Max approval amount must be non-negative'
        }
      }
    },
    HEAD_TELLER: {
      can_manage_tellers: { type: Boolean, default: true },
      can_authorize_cash_transfers: { type: Boolean, default: true },
      can_conduct_inventory: { type: Boolean, default: true },
      can_override_drawer_limits: { type: Boolean, default: true },
      max_transfer_authority: {
        type: Schema.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('1000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Max transfer authority must be non-negative'
        }
      }
    },
    BRANCH_OFFICER_SUPERVISOR: {
      can_supervise_operations: { type: Boolean, default: true },
      can_authorize_transactions: { type: Boolean, default: true },
      can_conduct_daily_reconciliations: { type: Boolean, default: true },
      can_manage_cash_levels: { type: Boolean, default: true },
      max_supervision_amount: {
        type: Schema.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('2000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Max supervision amount must be non-negative'
        }
      }
    },
    VAULT_MANAGER: {
      can_manage_vault_access: { type: Boolean, default: true },
      can_configure_security: { type: Boolean, default: true },
      can_authorize_emergency_access: { type: Boolean, default: true },
      can_manage_compartments: { type: Boolean, default: true },
      full_system_access: { type: Boolean, default: true }
    }
  },

  ACCESS_SCHEDULE: {
    opening_time: { 
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Opening time must be in HH:MM format'
      }
    },
    closing_time: { 
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Closing time must be in HH:MM format'
      }
    },
    operating_days: [{
      type: String,
      enum: {
        values: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
        message: 'Operating day must be one of: MON, TUE, WED, THU, FRI, SAT, SUN'
      }
    }],
    after_hours_access: { type: Boolean, default: false },
    emergency_access_protocol: { 
      type: String, 
      maxlength: [1000, 'Emergency access protocol cannot exceed 1000 characters'] 
    },
    after_hours_authorized_roles: [{
      type: String,
      enum: {
        values: ['BRANCH_MANAGER', 'VAULT_MANAGER', 'HEAD_TELLER'],
        message: 'After hours authorized role must be one of: BRANCH_MANAGER, VAULT_MANAGER, HEAD_TELLER'
      }
    }]
  },

  // =============================================
  // ENHANCED SECURITY MONITORING
  // =============================================
  LAST_ACCESS_LOG: {
    access_time: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v <= new Date();
        },
        message: 'Access time cannot be in the future'
      }
    },
    accessed_by: {
      type: String,
      maxlength: [24, 'Accessed by cannot exceed 24 characters']
    },
    accessed_by_role: {
      type: String,
      maxlength: [50, 'Accessed by role cannot exceed 50 characters']
    },
    access_type: {
      type: String,
      enum: {
        values: ['NORMAL', 'EMERGENCY', 'MAINTENANCE', 'AUDIT', 'SUPERVISORY'],
        message: 'Access type must be one of: NORMAL, EMERGENCY, MAINTENANCE, AUDIT, SUPERVISORY'
      }
    },
    duration_minutes: {
      type: Number,
      min: [0, 'Duration minutes cannot be negative']
    },
    purpose: {
      type: String,
      maxlength: [500, 'Purpose cannot exceed 500 characters']
    },
    verified_by: {
      type: String,
      maxlength: [24, 'Verified by cannot exceed 24 characters']
    },
    verified_by_role: {
      type: String,
      maxlength: [50, 'Verified by role cannot exceed 50 characters']
    }
  },

  ACCESS_ATTEMPTS: [{
    attempt_time: { 
      type: Date, 
      required: [true, 'Attempt time is required'],
      validate: {
        validator: function(v) {
          return v <= new Date();
        },
        message: 'Attempt time cannot be in the future'
      }
    },
    user_id: { 
      type: String,
      maxlength: [24, 'User ID cannot exceed 24 characters']
    },
    user_role: {
      type: String,
      maxlength: [50, 'User role cannot exceed 50 characters']
    },
    access_method: { 
      type: String,
      maxlength: [100, 'Access method cannot exceed 100 characters']
    },
    success: { 
      type: Boolean, 
      required: [true, 'Success status is required'] 
    },
    failure_reason: {
      type: String,
      maxlength: [500, 'Failure reason cannot exceed 500 characters']
    },
    location: {
      type: String,
      maxlength: [100, 'Location cannot exceed 100 characters']
    },
    requires_escalation: { type: Boolean, default: false },
    escalated_to: {
      type: String,
      maxlength: [50, 'Escalated to cannot exceed 50 characters']
    }
  }],

  SECURITY_BREACH_COUNT: {
    type: Number,
    default: 0,
    min: [0, 'Security breach count cannot be negative']
  },

  LAST_SECURITY_CHECK: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v <= new Date();
      },
      message: 'Last security check cannot be in the future'
    }
  },

  NEXT_SECURITY_AUDIT: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > new Date();
      },
      message: 'Next security audit must be in the future'
    }
  },

  // =============================================
  // ESCALATION & APPROVAL WORKFLOWS
  // =============================================
  ESCALATION_HIERARCHY: {
    level_1: { 
      role: { 
        type: String, 
        enum: ['HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR'], 
        default: 'HEAD_TELLER' 
      },
      threshold: { 
        type: Schema.Types.Decimal128, 
        default: mongoose.Types.Decimal128.fromString('500000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Threshold must be non-negative'
        }
      }
    },
    level_2: { 
      role: { 
        type: String, 
        enum: ['BRANCH_OFFICER_SUPERVISOR', 'BRANCH_MANAGER'], 
        default: 'BRANCH_OFFICER_SUPERVISOR' 
      },
      threshold: { 
        type: Schema.Types.Decimal128, 
        default: mongoose.Types.Decimal128.fromString('1000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Threshold must be non-negative'
        }
      }
    },
    level_3: { 
      role: { 
        type: String, 
        enum: ['BRANCH_MANAGER', 'VAULT_MANAGER'], 
        default: 'BRANCH_MANAGER' 
      },
      threshold: { 
        type: Schema.Types.Decimal128, 
        default: mongoose.Types.Decimal128.fromString('2000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Threshold must be non-negative'
        }
      }
    },
    level_4: { 
      role: { 
        type: String, 
        enum: ['VAULT_MANAGER'], 
        default: 'VAULT_MANAGER' 
      },
      threshold: { 
        type: Schema.Types.Decimal128, 
        default: mongoose.Types.Decimal128.fromString('5000000.00'),
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Threshold must be non-negative'
        }
      }
    }
  },

  PENDING_APPROVALS: [{
    approval_id: { 
      type: String, 
      required: [true, 'Approval ID is required'] 
    },
    transaction_type: {
      type: String,
      required: [true, 'Transaction type is required'],
      enum: {
        values: ['WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'ADJUSTMENT', 'ACCESS_REQUEST'],
        message: 'Transaction type must be one of: WITHDRAWAL, DEPOSIT, TRANSFER, ADJUSTMENT, ACCESS_REQUEST'
      }
    },
    amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return parseFloat(v.toString()) >= 0;
        },
        message: 'Amount must be non-negative'
      }
    },
    requested_by: { 
      type: String, 
      required: [true, 'Requested by is required'],
      maxlength: [24, 'Requested by cannot exceed 24 characters']
    },
    requested_by_role: { 
      type: String, 
      required: [true, 'Requested by role is required'],
      maxlength: [50, 'Requested by role cannot exceed 50 characters']
    },
    request_date: { 
      type: Date, 
      default: Date.now,
      validate: {
        validator: function(v) {
          return v <= new Date();
        },
        message: 'Request date cannot be in the future'
      }
    },
    approval_required_from: [{
      type: String,
      maxlength: [50, 'Approval role cannot exceed 50 characters']
    }],
    current_approvers: [{
      role: {
        type: String,
        maxlength: [50, 'Approver role cannot exceed 50 characters']
      },
      user_id: {
        type: String,
        maxlength: [24, 'User ID cannot exceed 24 characters']
      },
      user_name: {
        type: String,
        maxlength: [100, 'User name cannot exceed 100 characters']
      },
      approved: { type: Boolean, default: false },
      approval_date: {
        type: Date,
        validate: {
          validator: function(v) {
            return !v || v <= new Date();
          },
          message: 'Approval date cannot be in the future'
        }
      },
      notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
      }
    }],
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'],
        message: 'Status must be one of: PENDING, APPROVED, REJECTED, ESCALATED'
      },
      default: 'PENDING'
    },
    urgency: {
      type: String,
      enum: {
        values: ['NORMAL', 'HIGH', 'EMERGENCY'],
        message: 'Urgency must be one of: NORMAL, HIGH, EMERGENCY'
      },
      default: 'NORMAL'
    }
  }],

  // =============================================
  // INSURANCE & COMPLIANCE
  // =============================================
  INSURANCE_DETAILS: {
    policy_number: {
      type: String,
      maxlength: [50, 'Policy number cannot exceed 50 characters']
    },
    insurance_company: {
      type: String,
      maxlength: [100, 'Insurance company cannot exceed 100 characters']
    },
    coverage_amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Coverage amount must be non-negative'
      }
    },
    premium_amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Premium amount must be non-negative'
      }
    },
    renewal_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Renewal date must be in the future'
      }
    },
    deductible: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Deductible must be non-negative'
      }
    },
    coverage_type: {
      type: String,
      enum: {
        values: ['FULL', 'PARTIAL', 'CASH_ONLY', 'SPECIFIED_ITEMS'],
        message: 'Coverage type must be one of: FULL, PARTIAL, CASH_ONLY, SPECIFIED_ITEMS'
      }
    },
    authorized_signatories: [{
      name: {
        type: String,
        maxlength: [100, 'Signatory name cannot exceed 100 characters']
      },
      role: {
        type: String,
        maxlength: [50, 'Signatory role cannot exceed 50 characters']
      },
      signature_authority: {
        type: Schema.Types.Decimal128,
        validate: {
          validator: function(v) {
            return parseFloat(v.toString()) >= 0;
          },
          message: 'Signature authority must be non-negative'
        }
      }
    }]
  },

  COMPLIANCE_INFO: {
    last_audit_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v <= new Date();
        },
        message: 'Last audit date cannot be in the future'
      }
    },
    next_audit_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Next audit date must be in the future'
      }
    },
    audit_status: {
      type: String,
      enum: {
        values: ['COMPLIANT', 'NON_COMPLIANT', 'UNDER_REVIEW'],
        message: 'Audit status must be one of: COMPLIANT, NON_COMPLIANT, UNDER_REVIEW'
      },
      default: 'COMPLIANT'
    },
    compliance_rating: { 
      type: Number, 
      min: [0, 'Compliance rating cannot be less than 0'], 
      max: [100, 'Compliance rating cannot exceed 100'] 
    },
    regulatory_body: {
      type: String,
      maxlength: [100, 'Regulatory body cannot exceed 100 characters']
    },
    certification_number: {
      type: String,
      maxlength: [50, 'Certification number cannot exceed 50 characters']
    },
    audit_conducted_by: {
      type: String,
      maxlength: [100, 'Audit conducted by cannot exceed 100 characters']
    },
    audit_approved_by: {
      type: String,
      maxlength: [100, 'Audit approved by cannot exceed 100 characters']
    }
  },

  // =============================================
  // MAINTENANCE & SERVICE RECORDS
  // =============================================
  MAINTENANCE_SCHEDULE: {
    last_maintenance: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v <= new Date();
        },
        message: 'Last maintenance date cannot be in the future'
      }
    },
    next_maintenance: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Next maintenance date must be in the future'
      }
    },
    maintenance_frequency: {
      type: Number,
      default: 90,
      min: [1, 'Maintenance frequency must be at least 1 day']
    },
    maintenance_provider: {
      type: String,
      maxlength: [100, 'Maintenance provider cannot exceed 100 characters']
    },
    service_contract: {
      has_contract: { type: Boolean, default: false },
      contract_number: {
        type: String,
        maxlength: [50, 'Contract number cannot exceed 50 characters']
      },
      contract_expiry: {
        type: Date,
        validate: {
          validator: function(v) {
            return !v || v > new Date();
          },
          message: 'Contract expiry must be in the future'
        }
      },
      authorized_approver: {
        type: String,
        maxlength: [50, 'Authorized approver cannot exceed 50 characters']
      }
    }
  },

  MAINTENANCE_LOGS: [{
    maintenance_date: { 
      type: Date, 
      required: [true, 'Maintenance date is required'],
      validate: {
        validator: function(v) {
          return v <= new Date();
        },
        message: 'Maintenance date cannot be in the future'
      }
    },
    maintenance_type: {
      type: String,
      required: [true, 'Maintenance type is required'],
      enum: {
        values: ['ROUTINE', 'EMERGENCY', 'UPGRADE', 'INSPECTION'],
        message: 'Maintenance type must be one of: ROUTINE, EMERGENCY, UPGRADE, INSPECTION'
      }
    },
    performed_by: { 
      type: String, 
      required: [true, 'Performed by is required'],
      maxlength: [100, 'Performed by cannot exceed 100 characters']
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    cost: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return parseFloat(v.toString()) >= 0;
        },
        message: 'Cost must be non-negative'
      }
    },
    duration_hours: {
      type: Number,
      min: [0, 'Duration hours cannot be negative']
    },
    next_maintenance_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Next maintenance date must be in the future'
      }
    },
    approved_by: {
      type: String,
      maxlength: [50, 'Approved by cannot exceed 50 characters']
    },
    authorization_notes: {
      type: String,
      maxlength: [500, 'Authorization notes cannot exceed 500 characters']
    }
  }],

  // =============================================
  // ENHANCED BALANCE TRACKING
  // =============================================
  CASH_COMPOSITION: {
    cash_on_hand: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Cash on hand must be non-negative'
      }
    },
    checks: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Checks amount must be non-negative'
      }
    },
    coins: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Coins amount must be non-negative'
      }
    },
    foreign_currency: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Foreign currency amount must be non-negative'
      }
    },
    other_valuables: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Other valuables amount must be non-negative'
      }
    }
  },

  CURRENCY_DENOMINATIONS: {
    N1000: { type: Number, default: 0, min: [0, 'N1000 count cannot be negative'] },
    N500: { type: Number, default: 0, min: [0, 'N500 count cannot be negative'] },
    N200: { type: Number, default: 0, min: [0, 'N200 count cannot be negative'] },
    N100: { type: Number, default: 0, min: [0, 'N100 count cannot be negative'] },
    N50: { type: Number, default: 0, min: [0, 'N50 count cannot be negative'] },
    N20: { type: Number, default: 0, min: [0, 'N20 count cannot be negative'] },
    N10: { type: Number, default: 0, min: [0, 'N10 count cannot be negative'] },
    N5: { type: Number, default: 0, min: [0, 'N5 count cannot be negative'] }
  },

  // =============================================
  // TRANSACTION LIMITS & CONTROLS
  // =============================================
  TRANSACTION_LIMITS: {
    max_single_deposit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Max single deposit must be non-negative'
      }
    },
    max_single_withdrawal: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Max single withdrawal must be non-negative'
      }
    },
    daily_deposit_limit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Daily deposit limit must be non-negative'
      }
    },
    daily_withdrawal_limit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Daily withdrawal limit must be non-negative'
      }
    },
    min_transaction_amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Min transaction amount must be non-negative'
      }
    },
    require_approval_amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Require approval amount must be non-negative'
      }
    },
    head_teller_approval_limit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Head teller approval limit must be non-negative'
      }
    },
    supervisor_approval_limit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Supervisor approval limit must be non-negative'
      }
    },
    branch_manager_approval_limit: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || parseFloat(v.toString()) >= 0;
        },
        message: 'Branch manager approval limit must be non-negative'
      }
    }
  },

  // =============================================
  // EMERGENCY PROCEDURES
  // =============================================
  EMERGENCY_CONTACTS: [{
    name: { 
      type: String, 
      required: [true, 'Contact name is required'],
      maxlength: [100, 'Contact name cannot exceed 100 characters'],
      trim: true
    },
    role: { 
      type: String, 
      required: [true, 'Contact role is required'],
      enum: {
        values: ['BRANCH_MANAGER', 'HEAD_TELLER', 'VAULT_MANAGER', 'SECURITY_OFFICER'],
        message: 'Contact role must be one of: BRANCH_MANAGER, HEAD_TELLER, VAULT_MANAGER, SECURITY_OFFICER'
      }
    },
    phone: { 
      type: String, 
      required: [true, 'Contact phone is required'],
      maxlength: [20, 'Contact phone cannot exceed 20 characters']
    },
    email: {
      type: String,
      maxlength: [100, 'Contact email cannot exceed 100 characters'],
      validate: {
        validator: function(v) {
          return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format'
      }
    },
    is_primary: { type: Boolean, default: false },
    backup_contact: {
      type: String,
      maxlength: [100, 'Backup contact cannot exceed 100 characters']
    }
  }],

  EMERGENCY_PROTOCOLS: {
    emergency_lockdown_procedure: {
      type: String,
      maxlength: [2000, 'Emergency lockdown procedure cannot exceed 2000 characters']
    },
    emergency_access_procedure: {
      type: String,
      maxlength: [2000, 'Emergency access procedure cannot exceed 2000 characters']
    },
    key_holder_contact: {
      type: String,
      maxlength: [100, 'Key holder contact cannot exceed 100 characters']
    },
    backup_key_location: {
      type: String,
      maxlength: [200, 'Backup key location cannot exceed 200 characters']
    },
    emergency_service_contacts: {
      type: String,
      maxlength: [500, 'Emergency service contacts cannot exceed 500 characters']
    },
    primary_emergency_responder: { 
      type: String, 
      default: 'BRANCH_MANAGER',
      maxlength: [50, 'Primary emergency responder cannot exceed 50 characters']
    },
    secondary_emergency_responder: { 
      type: String, 
      default: 'HEAD_TELLER',
      maxlength: [50, 'Secondary emergency responder cannot exceed 50 characters']
    }
  },

  // =============================================
  // AUDIT TRAIL ENHANCEMENTS
  // =============================================
  LAST_FULL_INVENTORY: {
    inventory_date: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v <= new Date();
        },
        message: 'Inventory date cannot be in the future'
      }
    },
    conducted_by: {
      type: String,
      maxlength: [100, 'Conducted by cannot exceed 100 characters']
    },
    conducted_by_role: {
      type: String,
      maxlength: [50, 'Conducted by role cannot exceed 50 characters']
    },
    verified_by: {
      type: String,
      maxlength: [100, 'Verified by cannot exceed 100 characters']
    },
    verified_by_role: {
      type: String,
      maxlength: [50, 'Verified by role cannot exceed 50 characters']
    },
    approved_by: {
      type: String,
      maxlength: [100, 'Approved by cannot exceed 100 characters']
    },
    discrepancy_amount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: function(v) {
          return !v || isFinite(parseFloat(v.toString()));
        },
        message: 'Discrepancy amount must be a valid number'
      }
    },
    discrepancy_notes: {
      type: String,
      maxlength: [1000, 'Discrepancy notes cannot exceed 1000 characters']
    },
    next_scheduled_inventory: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Next scheduled inventory must be in the future'
      }
    }
  },

  // =============================================
  // STATUS & OPERATIONAL FLAGS
  // =============================================
  VAULT_STATUS: {
    type: String,
    required: [true, 'VAULT_STATUS is required'],
    enum: {
      values: ['OPERATIONAL', 'MAINTENANCE', 'EMERGENCY_LOCKDOWN', 'INVENTORY', 'DECOMMISSIONED'],
      message: 'VAULT_STATUS must be one of: OPERATIONAL, MAINTENANCE, EMERGENCY_LOCKDOWN, INVENTORY, DECOMMISSIONED'
    },
    default: 'OPERATIONAL'
  },

  IS_ACTIVE: {
    type: Boolean,
    default: true
  },

  // =============================================
  // TIMESTAMPS & VERSIONING
  // =============================================
  CREATED_BY: {
    type: String,
    required: [true, 'CREATED_BY is required'],
    maxlength: [24, 'CREATED_BY cannot exceed 24 characters']
  },
  
  UPDATED_BY: {
    type: String,
    maxlength: [24, 'UPDATED_BY cannot exceed 24 characters']
  },

  LAST_ACTIVITY_DATE: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function(v) {
        return v <= new Date();
      },
      message: 'Last activity date cannot be in the future'
    }
  }

}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      // Convert Decimal128 to string for JSON response
      const decimalFields = [
        'VAULT_CAPACITY', 
        'INSURANCE_DETAILS.coverage_amount',
        'INSURANCE_DETAILS.premium_amount',
        'INSURANCE_DETAILS.deductible',
        'CASH_COMPOSITION.cash_on_hand',
        'CASH_COMPOSITION.checks',
        'CASH_COMPOSITION.coins',
        'CASH_COMPOSITION.foreign_currency',
        'CASH_COMPOSITION.other_valuables',
        'TRANSACTION_LIMITS.max_single_deposit',
        'TRANSACTION_LIMITS.max_single_withdrawal',
        'TRANSACTION_LIMITS.daily_deposit_limit',
        'TRANSACTION_LIMITS.daily_withdrawal_limit',
        'TRANSACTION_LIMITS.min_transaction_amount',
        'TRANSACTION_LIMITS.require_approval_amount',
        'ROLE_ACCESS_MATRIX.BRANCH_MANAGER.max_approval_amount',
        'ROLE_ACCESS_MATRIX.HEAD_TELLER.max_transfer_authority',
        'ROLE_ACCESS_MATRIX.BRANCH_OFFICER_SUPERVISOR.max_supervision_amount',
        'ESCALATION_HIERARCHY.level_1.threshold',
        'ESCALATION_HIERARCHY.level_2.threshold',
        'ESCALATION_HIERARCHY.level_3.threshold',
        'ESCALATION_HIERARCHY.level_4.threshold'
      ];
      
      decimalFields.forEach(field => {
        const fieldParts = field.split('.');
        if (fieldParts.length === 1) {
          if (ret[field]) ret[field] = parseFloat(ret[field].toString());
        } else if (fieldParts.length === 2) {
          if (ret[fieldParts[0]] && ret[fieldParts[0]][fieldParts[1]]) {
            ret[fieldParts[0]][fieldParts[1]] = parseFloat(ret[fieldParts[0]][fieldParts[1]].toString());
          }
        } else if (fieldParts.length === 3) {
          if (ret[fieldParts[0]] && ret[fieldParts[0]][fieldParts[1]] && ret[fieldParts[0]][fieldParts[1]][fieldParts[2]]) {
            ret[fieldParts[0]][fieldParts[1]][fieldParts[2]] = parseFloat(ret[fieldParts[0]][fieldParts[1]][fieldParts[2]].toString());
          }
        }
      });
      
      return ret;
    }
  }
});

// =============================================
// INDEXES FOR PERFORMANCE
// =============================================
VaultSchema.index({ VAULT_CD: 1 }, { unique: true });
VaultSchema.index({ DRAWER_REF: 1 }, { unique: true });
VaultSchema.index({ DRAWER_ID: 1 });
VaultSchema.index({ VAULT_CATEGORY: 1, VAULT_STATUS: 1 });
VaultSchema.index({ SECURITY_LEVEL: 1 });
VaultSchema.index({ "AUTHORIZED_PERSONNEL.user_id": 1 });
VaultSchema.index({ "AUTHORIZED_PERSONNEL.user_role": 1 });
VaultSchema.index({ "AUTHORIZED_PERSONNEL.is_active": 1 });
VaultSchema.index({ LAST_ACTIVITY_DATE: -1 });
VaultSchema.index({ NEXT_SECURITY_AUDIT: 1 });
VaultSchema.index({ "COMPLIANCE_INFO.audit_status": 1 });
VaultSchema.index({ "MAINTENANCE_SCHEDULE.next_maintenance": 1 });
VaultSchema.index({ "PENDING_APPROVALS.status": 1 });
VaultSchema.index({ "PENDING_APPROVALS.request_date": -1 });

// =============================================
// VIRTUAL FIELDS
// =============================================

// Virtual for vault utilization percentage
VaultSchema.virtual('utilizationPercentage').get(function() {
  const drawer = this.DRAWER_REF;
  if (!drawer || !drawer.CURRENT_BALANCE) return 0;
  
  const currentBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
  const capacity = parseFloat(this.VAULT_CAPACITY.toString());
  
  if (capacity === 0) return 0;
  return ((currentBalance / capacity) * 100).toFixed(2);
});

// Virtual for available capacity
VaultSchema.virtual('availableCapacity').get(function() {
  const drawer = this.DRAWER_REF;
  if (!drawer || !drawer.CURRENT_BALANCE) return parseFloat(this.VAULT_CAPACITY.toString());
  
  const currentBalance = parseFloat(drawer.CURRENT_BALANCE.toString());
  const capacity = parseFloat(this.VAULT_CAPACITY.toString());
  
  return Math.max(0, capacity - currentBalance);
});

// Virtual for active authorized personnel count
VaultSchema.virtual('activeAuthorizedCount').get(function() {
  if (!this.AUTHORIZED_PERSONNEL) return 0;
  return this.AUTHORIZED_PERSONNEL.filter(person => person.is_active).length;
});

// Virtual for role-based personnel count
VaultSchema.virtual('roleBasedCounts').get(function() {
  if (!this.AUTHORIZED_PERSONNEL) return {};
  
  const counts = {};
  const roles = ['BRANCH_MANAGER', 'HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR', 'VAULT_MANAGER', 'SUPERVISOR', 'TELLER'];
  
  roles.forEach(role => {
    counts[role] = this.AUTHORIZED_PERSONNEL.filter(
      person => person.user_role === role && person.is_active
    ).length;
  });
  
  return counts;
});

// Virtual for maintenance status
VaultSchema.virtual('maintenanceStatus').get(function() {
  const now = new Date();
  const nextMaintenance = this.MAINTENANCE_SCHEDULE?.next_maintenance;
  
  if (!nextMaintenance) return 'UNSCHEDULED';
  
  const daysUntilMaintenance = Math.ceil((nextMaintenance - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilMaintenance <= 0) return 'OVERDUE';
  if (daysUntilMaintenance <= 7) return 'DUE_SOON';
  if (daysUntilMaintenance <= 30) return 'UPCOMING';
  return 'SCHEDULED';
});

// Virtual for security compliance status
VaultSchema.virtual('securityCompliance').get(function() {
  const now = new Date();
  const lastSecurityCheck = this.LAST_SECURITY_CHECK;
  const nextAudit = this.NEXT_SECURITY_AUDIT;
  
  let status = 'COMPLIANT';
  let issues = [];
  
  if (!lastSecurityCheck || (now - lastSecurityCheck) > (90 * 24 * 60 * 60 * 1000)) {
    issues.push('Security check overdue');
    status = 'NON_COMPLIANT';
  }
  
  if (nextAudit && nextAudit < now) {
    issues.push('Security audit overdue');
    status = 'NON_COMPLIANT';
  }
  
  if (this.SECURITY_BREACH_COUNT > 0) {
    issues.push('Security breaches recorded');
    status = 'REQUIRES_ATTENTION';
  }
  
  return {
    status,
    issues,
    lastSecurityCheck: lastSecurityCheck,
    daysSinceLastCheck: lastSecurityCheck ? Math.floor((now - lastSecurityCheck) / (24 * 60 * 60 * 1000)) : null
  };
});

// Virtual for pending approvals count by role
VaultSchema.virtual('pendingApprovalsByRole').get(function() {
  if (!this.PENDING_APPROVALS) return {};
  
  const counts = {};
  this.PENDING_APPROVALS.forEach(approval => {
    approval.approval_required_from.forEach(role => {
      counts[role] = (counts[role] || 0) + 1;
    });
  });
  
  return counts;
});

// =============================================
// SCHEMA METHODS
// =============================================

// Method to authorize personnel with role-based validation
VaultSchema.methods.authorizePersonnel = function(userId, userName, userRole, authorizedBy, accessLevel = 'LIMITED', notes = '') {
  const now = new Date();
  
  // Validate input using the schema
  const validationErrors = validateVaultData({
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    authorized_by: authorizedBy,
    access_level: accessLevel,
    notes: notes
  }, authorizePersonnelSchema);
  
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }
  
  // Check if user is already authorized
  const existingAuth = this.AUTHORIZED_PERSONNEL.find(
    auth => auth.user_id === userId && auth.is_active
  );
  
  if (existingAuth) {
    throw new Error('User is already authorized for this vault');
  }
  
  // Check maximum authorized persons limit
  if (this.activeAuthorizedCount >= this.MAX_AUTHORIZED_PERSONS) {
    throw new Error('Maximum authorized personnel limit reached');
  }
  
  // Role-specific validations
  if (userRole === 'BRANCH_MANAGER') {
    const existingManager = this.AUTHORIZED_PERSONNEL.find(
      auth => auth.user_role === 'BRANCH_MANAGER' && auth.is_active
    );
    if (existingManager) {
      throw new Error('Only one Branch Manager can be authorized per vault');
    }
  }
  
  this.AUTHORIZED_PERSONNEL.push({
    user_id: userId,
    user_name: userName,
    user_role: userRole,
    access_level: accessLevel,
    authorization_start: now,
    is_active: true,
    authorized_by: authorizedBy,
    authorization_notes: notes
  });
  
  return this.AUTHORIZED_PERSONNEL[this.AUTHORIZED_PERSONNEL.length - 1];
};

// Method to check role-based permissions
VaultSchema.methods.checkRolePermissions = function(userRole, action, amount = 0) {
  const roleMatrix = this.ROLE_ACCESS_MATRIX[userRole];
  if (!roleMatrix) return { allowed: false, reason: 'Role not recognized' };
  
  let allowed = false;
  let reason = '';
  let requiresApproval = false;
  
  switch (action) {
    case 'AUTHORIZE_PERSONNEL':
      allowed = roleMatrix.can_authorize_personnel || false;
      reason = allowed ? '' : 'Insufficient permissions to authorize personnel';
      break;
      
    case 'APPROVE_TRANSACTION':
      if (roleMatrix.can_approve_large_transactions) {
        const maxAmount = parseFloat(roleMatrix.max_approval_amount?.toString() || '0');
        allowed = amount <= maxAmount;
        reason = allowed ? '' : `Amount exceeds approval limit of ${maxAmount}`;
      } else {
        allowed = false;
        reason = 'No transaction approval permissions';
      }
      break;
      
    case 'OVERRIDE_LIMITS':
      allowed = roleMatrix.can_override_limits || false;
      reason = allowed ? '' : 'Cannot override limits';
      break;
      
    case 'MANAGE_VAULT_ACCESS':
      allowed = roleMatrix.can_manage_vault_access || false;
      reason = allowed ? '' : 'Cannot manage vault access';
      break;
      
    default:
      allowed = false;
      reason = 'Action not recognized';
  }
  
  return { allowed, reason, requiresApproval };
};

// Method to determine required approvers based on amount
VaultSchema.methods.getRequiredApprovers = function(amount) {
  const amountNum = parseFloat(amount.toString ? amount.toString() : amount);
  const requiredApprovers = [];
  
  if (this.ESCALATION_HIERARCHY) {
    Object.values(this.ESCALATION_HIERARCHY).forEach(level => {
      const threshold = parseFloat(level.threshold?.toString() || '0');
      if (amountNum >= threshold) {
        requiredApprovers.push(level.role);
      }
    });
  }
  
  // Always require at least one approver for significant amounts
  if (requiredApprovers.length === 0 && amountNum > 0) {
    requiredApprovers.push('HEAD_TELLER');
  }
  
  return requiredApprovers;
};

// Method to create approval request
VaultSchema.methods.createApprovalRequest = function(transactionType, amount, requestedBy, requestedByRole, urgency = 'NORMAL') {
  // Validate input using the schema
  const validationErrors = validateVaultData({
    transaction_type: transactionType,
    amount: amount.toString(),
    requested_by: requestedBy,
    requested_by_role: requestedByRole,
    urgency: urgency
  }, approvalRequestSchema);
  
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }
  
  const approvalId = `APPR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const requiredApprovers = this.getRequiredApprovers(amount);
  
  const approvalRequest = {
    approval_id: approvalId,
    transaction_type: transactionType,
    amount: mongoose.Types.Decimal128.fromString(amount.toString()),
    requested_by: requestedBy,
    requested_by_role: requestedByRole,
    request_date: new Date(),
    approval_required_from: requiredApprovers,
    current_approvers: requiredApprovers.map(role => ({
      role: role,
      approved: false
    })),
    status: 'PENDING',
    urgency: urgency
  };
  
  this.PENDING_APPROVALS.push(approvalRequest);
  return approvalRequest;
};

// Method to approve a request
VaultSchema.methods.approveRequest = function(approvalId, approverId, approverName, approverRole, notes = '') {
  // Validate input using the schema
  const validationErrors = validateVaultData({
    approver_id: approverId,
    approver_name: approverName,
    approver_role: approverRole,
    notes: notes
  }, approveRequestSchema);
  
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }
  
  const approval = this.PENDING_APPROVALS.find(app => app.approval_id === approvalId);
  if (!approval) {
    throw new Error('Approval request not found');
  }
  
  const approverIndex = approval.current_approvers.findIndex(
    appr => appr.role === approverRole && !appr.approved
  );
  
  if (approverIndex === -1) {
    throw new Error('No pending approval required from your role');
  }
  
  approval.current_approvers[approverIndex].user_id = approverId;
  approval.current_approvers[approverIndex].user_name = approverName;
  approval.current_approvers[approverIndex].approved = true;
  approval.current_approvers[approverIndex].approval_date = new Date();
  approval.current_approvers[approverIndex].notes = notes;
  
  // Check if all approvals are complete
  const allApproved = approval.current_approvers.every(appr => appr.approved);
  if (allApproved) {
    approval.status = 'APPROVED';
  }
  
  return approval;
};

// Method to log access attempt with role tracking
VaultSchema.methods.logAccessAttempt = function(userId, userRole, accessMethod, success, failureReason = null, location = null) {
  const requiresEscalation = !success && (userRole === 'BRANCH_MANAGER' || userRole === 'VAULT_MANAGER');
  
  this.ACCESS_ATTEMPTS.push({
    attempt_time: new Date(),
    user_id: userId,
    user_role: userRole,
    access_method: accessMethod,
    success: success,
    failure_reason: failureReason,
    location: location,
    requires_escalation: requiresEscalation,
    escalated_to: requiresEscalation ? 'SECURITY_MANAGER' : null
  });
  
  // Keep only last 1000 access attempts
  if (this.ACCESS_ATTEMPTS.length > 1000) {
    this.ACCESS_ATTEMPTS = this.ACCESS_ATTEMPTS.slice(-1000);
  }
  
  if (!success) {
    this.SECURITY_BREACH_COUNT += 1;
  }
  
  return this.ACCESS_ATTEMPTS[this.ACCESS_ATTEMPTS.length - 1];
};

// Method to check if user is authorized with role consideration
VaultSchema.methods.isUserAuthorized = function(userId, requiredAccessLevel = 'LIMITED') {
  const auth = this.AUTHORIZED_PERSONNEL.find(
    a => a.user_id === userId && a.is_active
  );
  
  if (!auth) return false;
  
  const accessLevels = {
    'VIEW_ONLY': 1,
    'LIMITED': 2,
    'FULL': 3,
    'EMERGENCY': 4
  };
  
  return accessLevels[auth.access_level] >= accessLevels[requiredAccessLevel];
};

// Method to validate transaction against limits with role-based overrides
VaultSchema.methods.validateTransaction = function(amount, transactionType, userRole = null) {
  const limits = this.TRANSACTION_LIMITS;
  const amountNum = parseFloat(amount.toString ? amount.toString() : amount);
  
  const violations = [];
  let requiresApproval = false;
  let approvalRole = null;
  
  if (transactionType === 'DEPOSIT') {
    if (limits.max_single_deposit && amountNum > parseFloat(limits.max_single_deposit.toString())) {
      violations.push(`Deposit amount exceeds single transaction limit of ${limits.max_single_deposit}`);
    }
  } else if (transactionType === 'WITHDRAWAL') {
    if (limits.max_single_withdrawal && amountNum > parseFloat(limits.max_single_withdrawal.toString())) {
      violations.push(`Withdrawal amount exceeds single transaction limit of ${limits.max_single_withdrawal}`);
    }
  }
  
  if (limits.min_transaction_amount && amountNum < parseFloat(limits.min_transaction_amount.toString())) {
    violations.push(`Transaction amount below minimum of ${limits.min_transaction_amount}`);
  }
  
  // Check if approval is required based on amount and role
  if (limits.require_approval_amount && amountNum >= parseFloat(limits.require_approval_amount.toString())) {
    requiresApproval = true;
    
    // Determine which role needs to approve based on escalation hierarchy
    const approvers = this.getRequiredApprovers(amountNum);
    approvalRole = approvers[0] || 'HEAD_TELLER';
  }
  
  // Check if user's role can override the requirement
  if (userRole && requiresApproval) {
    const permissions = this.checkRolePermissions(userRole, 'APPROVE_TRANSACTION', amountNum);
    if (permissions.allowed) {
      requiresApproval = false;
    }
  }
  
  return {
    isValid: violations.length === 0,
    violations,
    requiresApproval,
    approvalRole,
    approvalAmount: limits.require_approval_amount
  };
};

// Method to update maintenance record with approval tracking
VaultSchema.methods.recordMaintenance = function(maintenanceType, performedBy, description, cost, durationHours, approvedBy = null) {
  // Validate input using the schema
  const validationErrors = validateVaultData({
    maintenance_type: maintenanceType,
    performed_by: performedBy,
    description: description,
    cost: cost.toString(),
    duration_hours: durationHours,
    approved_by: approvedBy
  }, maintenanceSchema);
  
  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
  }
  
  const now = new Date();
  
  this.MAINTENANCE_LOGS.push({
    maintenance_date: now,
    maintenance_type: maintenanceType,
    performed_by: performedBy,
    description: description,
    cost: mongoose.Types.Decimal128.fromString(cost.toString()),
    duration_hours: durationHours,
    next_maintenance_date: new Date(now.getTime() + (this.MAINTENANCE_SCHEDULE.maintenance_frequency * 24 * 60 * 60 * 1000)),
    approved_by: approvedBy,
    authorization_notes: approvedBy ? `Approved by ${approvedBy}` : 'Emergency maintenance'
  });
  
  this.MAINTENANCE_SCHEDULE.last_maintenance = now;
  this.MAINTENANCE_SCHEDULE.next_maintenance = new Date(now.getTime() + (this.MAINTENANCE_SCHEDULE.maintenance_frequency * 24 * 60 * 60 * 1000));
  
  return this.MAINTENANCE_LOGS[this.MAINTENANCE_LOGS.length - 1];
};

// Static method to validate vault creation data
VaultSchema.statics.validateCreateData = function(data) {
  return validateVaultData(data, createVaultSchema);
};

// Static method to validate vault update data
VaultSchema.statics.validateUpdateData = function(data) {
  return validateVaultData(data, updateVaultSchema);
};

// =============================================
// STATIC METHODS
// =============================================

// Static method to find vaults by category
VaultSchema.statics.findByCategory = function(category) {
  return this.find({ VAULT_CATEGORY: category }).populate('DRAWER_REF');
};

// Static method to find vaults requiring maintenance
VaultSchema.statics.findRequiringMaintenance = function() {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return this.find({
    'MAINTENANCE_SCHEDULE.next_maintenance': { $lte: sevenDaysFromNow },
    VAULT_STATUS: 'OPERATIONAL'
  }).populate('DRAWER_REF');
};

// Static method to find vaults with security issues
VaultSchema.statics.findWithSecurityIssues = function() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return this.find({
    $or: [
      { LAST_SECURITY_CHECK: { $lte: ninetyDaysAgo } },
      { LAST_SECURITY_CHECK: null },
      { SECURITY_BREACH_COUNT: { $gt: 0 } }
    ],
    IS_ACTIVE: true
  }).populate('DRAWER_REF');
};

// Static method to find vaults by authorized user
VaultSchema.statics.findByAuthorizedUser = function(userId) {
  return this.find({
    'AUTHORIZED_PERSONNEL.user_id': userId,
    'AUTHORIZED_PERSONNEL.is_active': true,
    IS_ACTIVE: true
  }).populate('DRAWER_REF');
};

// Static method to find vaults by role
VaultSchema.statics.findByRole = function(role) {
  return this.find({
    'AUTHORIZED_PERSONNEL.user_role': role,
    'AUTHORIZED_PERSONNEL.is_active': true,
    IS_ACTIVE: true
  }).populate('DRAWER_REF');
};

// Static method to find vaults with pending approvals for specific role
VaultSchema.statics.findWithPendingApprovalsForRole = function(role) {
  return this.find({
    'PENDING_APPROVALS': {
      $elemMatch: {
        'approval_required_from': role,
        'status': 'PENDING'
      }
    },
    IS_ACTIVE: true
  }).populate('DRAWER_REF');
};

// Static method to find high-capacity vaults
VaultSchema.statics.findHighCapacityVaults = function(threshold = 5000000) {
  return this.aggregate([
    {
      $lookup: {
        from: 'drawers',
        localField: 'DRAWER_REF',
        foreignField: '_id',
        as: 'drawer'
      }
    },
    {
      $unwind: '$drawer'
    },
    {
      $match: {
        'drawer.CURRENT_BALANCE': { $gte: mongoose.Types.Decimal128.fromString(threshold.toString()) }
      }
    }
  ]);
};

// =============================================
// MIDDLEWARE
// =============================================

// Pre-save middleware to validate vault data
// In your VaultSchema, update the pre-save middleware:
VaultSchema.pre('save', function(next) {
  // Validate authorized personnel limits - only for active vaults
  if (this.AUTHORIZED_PERSONNEL && this.IS_ACTIVE) {
    const activeCount = this.AUTHORIZED_PERSONNEL.filter(a => a.is_active).length;
    
    if (activeCount > this.MAX_AUTHORIZED_PERSONS) {
      return next(new Error(`Number of active authorized personnel (${activeCount}) exceeds maximum limit (${this.MAX_AUTHORIZED_PERSONS})`));
    }
    
    // Only enforce minimum for operational vaults
    if (activeCount < this.MIN_AUTHORIZED_PERSONS && this.VAULT_STATUS === 'OPERATIONAL') {
      return next(new Error(`Number of active authorized personnel (${activeCount}) is below minimum requirement (${this.MIN_AUTHORIZED_PERSONS})`));
    }
    
    // Validate role-specific constraints
    const branchManagerCount = this.AUTHORIZED_PERSONNEL.filter(
      a => a.user_role === 'BRANCH_MANAGER' && a.is_active
    ).length;
    
    if (branchManagerCount > 1) {
      return next(new Error('Only one Branch Manager can be authorized per vault'));
    }
  }
  
  // Update last activity date
  this.LAST_ACTIVITY_DATE = new Date();
  
  next();
});

// Post-save middleware to maintain data consistency
VaultSchema.post('save', async function(doc) {
  // Update the associated drawer's vault-specific fields
  try {
    await mongoose.model('Drawer').findByIdAndUpdate(doc.DRAWER_REF, {
      VAULT_TYPE: doc.VAULT_CATEGORY,
      SECURITY_LEVEL: doc.SECURITY_LEVEL,
      REQUIRES_DUAL_CONTROL: doc.REQUIRES_DUAL_CONTROL,
      VAULT_CAPACITY: doc.VAULT_CAPACITY,
      IS_HIGH_VALUE_VAULT: doc.VAULT_CATEGORY === 'HIGH_SECURITY_VAULT' || doc.VAULT_CATEGORY === 'BULLION_VAULT'
    });
  } catch (error) {
    console.error('Error updating associated drawer:', error);
  }
});

const Vault = mongoose.model('Vault', VaultSchema);

// Export validation schemas and functions for use in controllers
export {
  createVaultSchema,
  updateVaultSchema,
  authorizePersonnelSchema,
  approvalRequestSchema,
  approveRequestSchema,
  maintenanceSchema,
  validateVaultData
};

export default Vault;