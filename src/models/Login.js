import mongoose from 'mongoose';

const LoginSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    user_name: {
      type: String,
      required: false, // Changed from required: true
      default: 'Unknown', // Default value for anonymous attempts
      trim: true,
      maxlength: 50
    },
    username: { // ✅ ADDED: Legacy username field for compatibility
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      sparse: true
    },
    login_time: {
      type: Date,
      default: Date.now,
    },
    ip_address: {
      type: String,
      required: true,
    },
    session_id: { // ✅ ADDED: Session tracking
      type: String,
      required: false,
      trim: true
    },
    user_agent: { // ✅ ADDED: Browser/device info
      type: String,
      required: false,
      trim: true
    },
    status: {
      type: String,
      enum: ['Success', 'Failed', 'Locked', 'Expired'], // ✅ EXPANDED: Added more status types
      required: true,
    },
    success: { // ✅ ADDED: Boolean flag for easy filtering
      type: Boolean,
      required: true,
      default: false
    },
    error: {
      type: String,
      default: null,
    },
    error_code: { // ✅ ADDED: Standardized error codes
      type: String,
      enum: [
        null,
        'USER_NOT_FOUND',
        'INVALID_PASSWORD', 
        'ACCOUNT_DISABLED',
        'ACCOUNT_LOCKED',
        'ACCOUNT_EXPIRED',
        'OUTSIDE_LOGIN_HOURS',
        'IP_NOT_ALLOWED',
        'MULTI_SESSION_VIOLATION',
        'PASSWORD_EXPIRED',
        'FIRST_LOGIN_REQUIRED',
        'SESSION_LIMIT_EXCEEDED'
      ],
      default: null
    },
    attempt_identifier: {  // New field to track what was entered
      type: String,
      required: true,
      trim: true
    },
    login_type: { // ✅ ADDED: Type of login attempt
      type: String,
      enum: ['password', 'sso', 'token', 'auto'],
      default: 'password'
    },
    device_type: { // ✅ ADDED: Device information
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    location_data: { // ✅ ADDED: Geographic data
      country: String,
      city: String,
      timezone: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    failed_attempts_count: { // ✅ ADDED: Track consecutive failures
      type: Number,
      default: 0
    },
    password_changed: { // ✅ ADDED: Track if password was recently changed
      type: Boolean,
      default: false
    },
    legacy_user_id: { // ✅ ADDED: For legacy system compatibility
      type: Number,
      default: null,
      sparse: true
    },
    business_unit: { // ✅ ADDED: User's business unit context
      type: String,
      default: null,
      trim: true
    },
    role: { // ✅ ADDED: User's role at time of login
      type: String,
      default: null,
      trim: true
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ✅ ADDED: Virtual for formatted login time
LoginSchema.virtual('formatted_login_time').get(function() {
  return this.login_time.toLocaleString();
});

// ✅ ADDED: Virtual for login duration (if logout time is tracked elsewhere)
LoginSchema.virtual('is_recent').get(function() {
  const now = new Date();
  const loginTime = new Date(this.login_time);
  const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
  return hoursDiff < 24; // Within last 24 hours
});

// ✅ ADDED: Static method to get recent failed attempts
LoginSchema.statics.getRecentFailedAttempts = function(identifier, hours = 1) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.find({
    $or: [
      { user_name: identifier },
      { username: identifier },
      { attempt_identifier: identifier }
    ],
    status: 'Failed',
    login_time: { $gte: timeThreshold }
  }).sort({ login_time: -1 });
};

// ✅ ADDED: Static method to get user login history
LoginSchema.statics.getUserLoginHistory = function(userIdentifier, limit = 50) {
  return this.find({
    $or: [
      { user_id: userIdentifier },
      { user_name: userIdentifier },
      { username: userIdentifier }
    ]
  })
  .sort({ login_time: -1 })
  .limit(limit)
  .populate('user_id', 'user_name username email first_name last_name status');
};

// ✅ ADDED: Static method to get suspicious login attempts
LoginSchema.statics.getSuspiciousAttempts = function(hours = 24, threshold = 5) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.aggregate([
    {
      $match: {
        login_time: { $gte: timeThreshold },
        status: 'Failed'
      }
    },
    {
      $group: {
        _id: '$ip_address',
        attemptCount: { $sum: 1 },
        uniqueUsers: { $addToSet: '$attempt_identifier' },
        lastAttempt: { $max: '$login_time' }
      }
    },
    {
      $match: {
        attemptCount: { $gte: threshold }
      }
    },
    {
      $project: {
        ip_address: '$_id',
        attemptCount: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        lastAttempt: 1,
        _id: 0
      }
    },
    {
      $sort: { attemptCount: -1 }
    }
  ]);
};

// ✅ ADDED: Static method to clean old login records
LoginSchema.statics.cleanOldRecords = function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
  
  return this.deleteMany({
    login_time: { $lt: cutoffDate }
  });
};

// ✅ ADDED: Instance method to mark as successful
LoginSchema.methods.markAsSuccessful = function(sessionId = null, userAgent = null) {
  this.status = 'Success';
  this.success = true;
  this.error = null;
  this.error_code = null;
  
  if (sessionId) {
    this.session_id = sessionId;
  }
  
  if (userAgent) {
    this.user_agent = userAgent;
  }
  
  return this.save();
};

// ✅ ADDED: Instance method to mark as failed with specific error
LoginSchema.methods.markAsFailed = function(errorMessage, errorCode = null) {
  this.status = 'Failed';
  this.success = false;
  this.error = errorMessage;
  this.error_code = errorCode;
  this.failed_attempts_count = (this.failed_attempts_count || 0) + 1;
  
  return this.save();
};

// Add indexes for better query performance
LoginSchema.index({ user_id: 1 });
LoginSchema.index({ user_name: 1 });
LoginSchema.index({ username: 1 }); // ✅ ADDED: Index for legacy username
LoginSchema.index({ status: 1 });
LoginSchema.index({ success: 1 }); // ✅ ADDED: Index for success flag
LoginSchema.index({ login_time: -1 });
LoginSchema.index({ ip_address: 1 });
LoginSchema.index({ attempt_identifier: 1 }); // ✅ ADDED: Index for attempt identifier
LoginSchema.index({ session_id: 1 }); // ✅ ADDED: Index for session tracking
LoginSchema.index({ error_code: 1 }); // ✅ ADDED: Index for error analysis
LoginSchema.index({ 'location_data.country': 1 }); // ✅ ADDED: Index for geographic analysis

// ✅ ADDED: Compound indexes for common queries
LoginSchema.index({ user_name: 1, login_time: -1 });
LoginSchema.index({ ip_address: 1, login_time: -1 });
LoginSchema.index({ status: 1, login_time: -1 });
LoginSchema.index({ user_id: 1, login_time: -1 });

const Login = mongoose.model('Login', LoginSchema);
export default Login;