// models/securityPolicy.js
const mongoose = require('mongoose');

const securityPolicySchema = new mongoose.Schema({
    SEC_PLCY_ID: {
        type: String,
        required: true,
        unique: true
    }, // Security Policy ID
    policy_name: {
        type: String,
        required: true
    }, // Name of the security policy
    description: {
        type: String,
        required: true
    }, // Detailed description of the policy
    ENFORCE_BIO_VRFCTN_FG: {
        type: Boolean,
        default: false
    }, // Enforce biometric verification
    GRACE_LOGIN_PD: {
        type: Number,
        default: 0
    }, // Grace login period
    MAX_FAILED_LOGIN_ATTEMPTS: {
        type: Number,
        default: 5
    }, // Maximum failed login attempts
    PREVENT_PASSWD_REUSE_FG: {
        type: Boolean,
        default: false
    }, // Prevent password reuse flag
    PASSWD_CHANGE_FREQ: {
        type: Number,
        default: 30
    }, // Password change frequency in days
    PASSWD_MIN_LENGTH: {
        type: Number,
        default: 8
    }, // Minimum password length
    PASSWD_MAX_LENGTH: {
        type: Number,
        default: 64
    }, // Maximum password length
    ENFORCE_SLCTD_CHARSET_FG: {
        type: Boolean,
        default: false
    }, // Enforce selected charset flag
    SELECTED_CHARACTERSET: {
        type: String
    }, // Selected charset
    ENFORCE_SPEC_CHAR_FG: {
        type: Boolean,
        default: false
    }, // Enforce special characters flag
    SPEC_CHAR_POSN_CD: {
        type: String
    }, // Special character position code
    MANDATORY_CHAR_POSN_CD: {
        type: String
    }, // Mandatory character position code
    SPEC_CHAR_POSN: {
        type: String
    }, // Special character position
    ENFORCE_NUMERIC_CHAR_FG: {
        type: Boolean,
        default: false
    }, // Enforce numeric character flag
    NUMERIC_CHAR_POSN: {
        type: String
    }, // Numeric character position
    ENFORCE_MANDATORY_CHAR_FG: {
        type: Boolean,
        default: false
    }, // Enforce mandatory character flag
    REC_ST: {
        type: String
    }, // Record state
    VERSION_NO: {
        type: Number,
        default: 1
    }, // Version number
    ROW_TS: {
        type: Date,
        default: Date.now
    }, // Row timestamp
    USER_ID: {
        type: String,
        required: true
    }, // User ID of the policy creator
    CREATE_DT: {
        type: Date,
        default: Date.now
    }, // Policy creation date
    CREATED_BY: {
        type: String,
        required: true
    }, // User who created the policy
    SYS_CREATE_TS: {
        type: Date,
        default: Date.now
    }, // System creation timestamp
    PASSWD_EXP_NOTIFICATION: {
        type: Number,
        default: 7
    }, // Days before password expiration notification
    SUSPEND_USER_AFTER_DAYS: {
        type: Number,
        default: 30
    }, // Suspend user after X days of inactivity
    USER_ACTIVATE_BU_PROC_ID: {
        type: String
    }, // User activation business process ID
    USER_REMOVAL_BU_PROC_ID: {
        type: String
    }, // User removal business process ID
    USER_MODIFY_BU_PROC_ID: {
        type: String
    }, // User modification business process ID
    USER_ROLE_ACTIVATE_BU_PROC_ID: {
        type: String
    }, // User role activation business process ID
    USER_ROLE_DEACT_BU_PROC_ID: {
        type: String
    }, // User role deactivation business process ID
    USER_ROLE_MODIFY_BU_PROC_ID: {
        type: String
    }, // User role modification business process ID
    USER_ROLE_ADDITION_BU_PROC_ID: {
        type: String
    }, // User role addition business process ID
    PWD_REUSE_OPT: {
        type: String,
        default: 'none'
    }, // Password reuse option
    USER_DEACTIVATE_BU_PROC_ID: {
        type: String
    }, // User deactivation business process ID
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }, // Policy status
    created_at: {
        type: Date,
        default: Date.now
    }, // Policy creation date
    updated_at: {
        type: Date,
        default: Date.now
    }, // Policy last update date
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }, // Created by
    updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    } // Updated by
});

// Create the model
const SecurityPolicy = mongoose.model('SecurityPolicy', securityPolicySchema);
module.exports = SecurityPolicy;
