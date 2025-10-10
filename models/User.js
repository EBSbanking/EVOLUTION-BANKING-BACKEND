import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Define the user schema
const userSchema = new mongoose.Schema({
  user_name: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false // Hide password by default in queries
  },
  passwordHistory: {
    type: [String],
    select: false, // Hide password history by default
    default: []
  },
  passwordChangedAt: {
    type: Date,
    select: false, // Hide by default
    default: null
  },
  employer_number: String,
  first_name: String,
  last_name: String,
  middle_name: String,
  preferred_name: String,
  job_title: String,
  email: {
    type: String,
    required: true,
    unique: true,
    match: /.+\@.+\..+/,
  },
  customer_number: String,
  main_business_unit: {
    type: String,
    default: '',
  },
  responsibility_centre: String,
   BU_ROLE_ID: {
    type: Number,
    required: true,
    ref: 'UserRole' // Add reference to UserRole model
  },
  primary_business_role: {
    type: String,
    required: true, // 🔹 Make sure every user has a role
  },
  start_date: Date,
  expiry_date: Date,
  earliest_login_time: {
    type: String,
    default: "00:00",
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Earliest login time must be in HH:MM format (24-hour)'
    }
  },
  latest_login_time: {
    type: String,
    default: "23:59",
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Latest login time must be in HH:MM format (24-hour)'
    }
  },
  internal_employee_enabled: {
    type: Boolean,
    default: false,
  },
  relationship_officer: {
    type: String,
    default: '',
  },
  enable_multi_session: {
    type: Boolean,
    default: false,
  },
  validate_ip_address: {
    type: Boolean,
    default: false,
  },
  note: String,
  ip_address: String,
  is_supervisor: {
    type: Boolean,
    default: false,
  },
  is_main_BU: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['Active', 'Deactivated', 'ForceLocked'], // 🔹 Added ForceLocked status
    default: 'Active',
  },
  failed_attempts: {
    type: Number,
    default: 0,
  },
  lock_until: {
    type: Date,
    default: null,
  },
  reset_token: {
    type: String,
    default: null,
  },
  session_token: {
    type: String,
    default: null,
  },
  // 🔹 NEW FIELDS FOR SESSION MANAGEMENT AND FRAUD DETECTION
  current_sessions: [{
    session_id: String,
    login_time: {
      type: Date,
      default: Date.now
    },
    ip_address: String,
    user_agent: String,
    last_activity: {
      type: Date,
      default: Date.now
    },
    is_active: {
      type: Boolean,
      default: true
    }
  }],
  force_lock_reason: {
    type: String,
    default: null
  },
  force_locked_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  force_locked_at: {
    type: Date,
    default: null
  },
  last_login: {
    type: Date,
    default: null
  },
  login_history: [{
    login_time: Date,
    ip_address: String,
    user_agent: String,
    logout_time: Date,
    session_duration: Number, // in minutes
    was_forced_logout: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true,
});

// Middleware to hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const saltRounds = 10;
    this.password = await bcrypt.hash(this.password, saltRounds);
    this.passwordChangedAt = Date.now();
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to check password
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// 🔹 NEW METHOD: Check if current time is within login hours
userSchema.methods.isWithinLoginHours = function() {
  const now = new Date();
  const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // Get HH:MM format
  
  console.log('🕒 Login Hours Check:', {
    currentTime,
    earliest: this.earliest_login_time,
    latest: this.latest_login_time,
    user: this.user_name
  });
  
  // If no restrictions are set, allow login
  if (!this.earliest_login_time && !this.latest_login_time) {
    return true;
  }
  
  // Check if current time is within allowed range
  if (this.earliest_login_time && this.latest_login_time) {
    return currentTime >= this.earliest_login_time && currentTime <= this.latest_login_time;
  }
  
  return true;
};

// 🔹 NEW METHODS FOR FRAUD LOCK AND SESSION MANAGEMENT

// Force lock a user due to fraud
userSchema.methods.forceLock = function(adminUserId, reason = 'Suspicious activity detected') {
  this.status = 'ForceLocked';
  this.force_lock_reason = reason;
  this.force_locked_by = adminUserId;
  this.force_locked_at = new Date();
  this.lock_until = null; // Clear any temporary lock
  
  // Logout all active sessions
  this.logoutAllSessions(true);
  
  return this.save();
};

// Unlock a force-locked user
userSchema.methods.unlock = function() {
  if (this.status === 'ForceLocked') {
    this.status = 'Active';
    this.force_lock_reason = null;
    this.force_locked_by = null;
    this.force_locked_at = null;
    this.failed_attempts = 0;
    this.lock_until = null;
    
    return this.save();
  }
  return Promise.resolve(this);
};

// Add a new login session
userSchema.methods.addLoginSession = function(sessionData) {
  const session = {
    session_id: sessionData.session_id,
    ip_address: sessionData.ip_address,
    user_agent: sessionData.user_agent,
    login_time: new Date(),
    last_activity: new Date(),
    is_active: true
  };
  
  this.current_sessions.push(session);
  this.last_login = new Date();
  
  // Add to login history
  this.login_history.unshift({
    login_time: new Date(),
    ip_address: sessionData.ip_address,
    user_agent: sessionData.user_agent
  });
  
  // Keep only last 50 login history records
  if (this.login_history.length > 50) {
    this.login_history = this.login_history.slice(0, 50);
  }
  
  return this.save();
};

// Update session activity
userSchema.methods.updateSessionActivity = function(sessionId) {
  const session = this.current_sessions.find(s => s.session_id === sessionId && s.is_active);
  if (session) {
    session.last_activity = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Logout a specific session
userSchema.methods.logoutSession = function(sessionId, isForced = false) {
  const session = this.current_sessions.find(s => s.session_id === sessionId && s.is_active);
  if (session) {
    session.is_active = false;
    
    // Update login history with logout time
    const loginRecord = this.login_history.find(record => 
      !record.logout_time && 
      record.ip_address === session.ip_address && 
      record.login_time.getTime() === session.login_time.getTime()
    );
    
    if (loginRecord) {
      loginRecord.logout_time = new Date();
      loginRecord.was_forced_logout = isForced;
      loginRecord.session_duration = Math.round(
        (loginRecord.logout_time - loginRecord.login_time) / (1000 * 60)
      );
    }
    
    return this.save();
  }
  return Promise.resolve(this);
};

// Add virtual population
userSchema.virtual('userRoles', {
  ref: 'UserRole',
  localField: 'BU_ROLE_ID',
  foreignField: 'USER_ROLE_ID',
  justOne: false
});

// Logout all active sessions
userSchema.methods.logoutAllSessions = function(isForced = false) {
  const now = new Date();
  
  this.current_sessions.forEach(session => {
    if (session.is_active) {
      session.is_active = false;
      
      // Update login history
      const loginRecord = this.login_history.find(record => 
        !record.logout_time && 
        record.ip_address === session.ip_address && 
        record.login_time.getTime() === session.login_time.getTime()
      );
      
      if (loginRecord) {
        loginRecord.logout_time = now;
        loginRecord.was_forced_logout = isForced;
        loginRecord.session_duration = Math.round(
          (loginRecord.logout_time - loginRecord.login_time) / (1000 * 60)
        );
      }
    }
  });
  
  return this.save();
};

// Check if user has active sessions
userSchema.methods.hasActiveSessions = function() {
  return this.current_sessions.some(session => session.is_active);
};

// Get all active sessions
userSchema.methods.getActiveSessions = function() {
  return this.current_sessions.filter(session => session.is_active);
};

// 🔹 STATIC METHODS

// Static method to find user by username with password selected
userSchema.statics.findByUsernameWithPassword = function(username) {
  return this.findOne({ 
    user_name: { $regex: new RegExp(`^${username}$`, 'i') }
  }).select('+password +passwordHistory');
};

// Get all users with active sessions
userSchema.statics.getAllUsersWithActiveSessions = function() {
  return this.find({
    'current_sessions.is_active': true
  }).select('user_name first_name last_name email current_sessions status');
};

// Get all currently logged-in users
userSchema.statics.getCurrentlyLoggedInUsers = function() {
  return this.aggregate([
    { $match: { 'current_sessions.is_active': true } },
    { $unwind: '$current_sessions' },
    { $match: { 'current_sessions.is_active': true } },
    { $project: {
        user_name: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        status: 1,
        session: '$current_sessions'
      }
    }
  ]);
};

// Force logout all users (admin function)
userSchema.statics.forceLogoutAllUsers = function(adminUserId) {
  return this.updateMany(
    { 'current_sessions.is_active': true },
    { 
      $set: { 
        'current_sessions.$[].is_active': false 
      } 
    }
  ).then(() => {
    // Update login history for all affected users
    return this.updateMany(
      { 'login_history': { $exists: true } },
      [{
        $set: {
          login_history: {
            $map: {
              input: '$login_history',
              as: 'record',
              in: {
                $cond: [
                  { $eq: ['$$record.logout_time', null] },
                  {
                    $mergeObjects: [
                      '$$record',
                      {
                        logout_time: new Date(),
                        was_forced_logout: true,
                        session_duration: {
                          $divide: [
                            { $subtract: [new Date(), '$$record.login_time'] },
                            60000
                          ]
                        }
                      }
                    ]
                  },
                  '$$record'
                ]
              }
            }
          }
        }
      }]
    );
  });
};

// Find force-locked users
userSchema.statics.getForceLockedUsers = function() {
  return this.find({ status: 'ForceLocked' })
    .select('user_name first_name last_name email force_lock_reason force_locked_at force_locked_by');
};

// // 🔹 NEW STATIC METHOD: Update user login hours
// userSchema.statics.updateLoginHours = function(userId, loginHours) {
//   return this.findByIdAndUpdate(
//     userId,
//     { 
//       earliest_login_time: loginHours.earliest_login_time,
//       latest_login_time: loginHours.latest_login_time
//     },
//     { new: true, runValidators: true }
//   );
// };

// // 🔹 NEW STATIC METHOD: Get users with login hours restrictions
// userSchema.statics.getUsersWithLoginRestrictions = function() {
//   return this.find({
//     $or: [
//       { earliest_login_time: { $ne: "00:00" } },
//       { latest_login_time: { $ne: "23:59" } }
//     ]
//   }).select('user_name first_name last_name earliest_login_time latest_login_time');
// };


// 🔹 MODIFIED METHOD: Always allow login (24-hour access)
userSchema.methods.isWithinLoginHours = function() {
  console.log('🔓 24-Hour Login Access Enabled:', {
    user: this.user_name,
    message: 'Login time restrictions disabled - 24-hour access allowed'
  });
  
  // Always return true to allow 24-hour login access
  return true;
};

// 🔹 MODIFIED STATIC METHOD: No users have login restrictions
userSchema.statics.getUsersWithLoginRestrictions = function() {
  console.log('🔓 Login restrictions disabled - returning empty list');
  return this.find({
    _id: null // This will always return empty results
  }).select('user_name first_name last_name earliest_login_time latest_login_time');
};

// Create and export User model
const User = mongoose.model('User', userSchema);
export default User;