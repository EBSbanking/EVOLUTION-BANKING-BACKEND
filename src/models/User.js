import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const userSchema = new mongoose.Schema({
  // Legacy fields to match existing data
  id: {
    type: Number,
    unique: true,
    sparse: true
  },
  user_id: {
    type: Number,
    unique: true,
    sparse: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    // REMOVED: index: true
  },
  
  // Modern fields
  user_name: {
    type: String,
    required: false,
    unique: true,
    sparse: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  passwordHistory: {
    type: [String],
    select: false,
    default: []
  },
  passwordChangedAt: {
    type: Date,
    select: false,
    default: null
  },
  firstLogin: {
    type: Boolean,
    default: true,
  },
  employer_number: String,
  first_name: String,
  last_name: String,
  middle_name: String,
  preferred_name: String,
  job_title: String,
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    match: /.+\@.+\..+/,
  },
  customer_number: String,
  main_business_unit: {
    type: String,
    default: '',
  },
  responsibility_centre: String,
  
  roles: [{
    type: Number,
    default: []
  }],
  
  primary_role: {
    type: Number,
    sparse: true
  },
  
  // Legacy compatibility
  BU_ROLE_ID: {
    type: Number,
    sparse: true
  },
  
  primary_business_role: {
    type: String,
    required: false,
    default: 'Staff'
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
    enum: ['Active', 'Deactivated', 'ForceLocked'],
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
  
  // Legacy session compatibility
  token: {
    type: String,
    default: null,
  },
  last_updated: {
    type: Date,
    default: Date.now
  },
  
  // Modern session management
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
    session_duration: Number,
    was_forced_logout: {
      type: Boolean,
      default: false
    }
  }],

  // Legacy fields for migration
  utype: {
    type: String,
    sparse: true
  },
  role: {
    type: Number,
    sparse: true
  },
  fname: {
    type: String,
    sparse: true
  },
  lname: {
    type: String,
    sparse: true
  },
  is_active: {
    type: String,
    sparse: true
  },
  branch: {
    type: Number,
    sparse: true
  },
  changepass_on_first_login: {
    type: Number,
    sparse: true
  },
  pass_never_expire: {
    type: Number,
    sparse: true
  },
  is_locked: {
    type: String,
    sparse: true
  },
  date_joined: {
    type: Date,
    sparse: true
  },
  date_modified: {
    type: Date,
    sparse: true
  },
  last_updated_password: {
    type: Date,
    sparse: true
  },
  ist_log: {
    type: Number,
    sparse: true
  },
  rofficer: {
    type: String,
    sparse: true
  },
  staffphoto: {
    type: String,
    sparse: true
  },
  created_by: {
    type: Number,
    sparse: true
  },
  us_agent: {
    type: String,
    sparse: true
  },
  browser_lock: {
    type: Number,
    sparse: true
  },
  reset_browser: {
    type: Number,
    sparse: true
  },
  updated_pwd: {
    type: Number,
    sparse: true
  }
}, {
  timestamps: true,
});

// Index for performance
userSchema.index({ user_name: 1 });
userSchema.index({ username: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ primary_role: 1 });

// ✅ ENHANCED: Middleware to handle legacy data compatibility
userSchema.pre('save', async function(next) {
  console.log('🔄 LEGACY MIGRATION DEBUG - User Pre-Save:', {
    username: this.username,
    user_name: this.user_name,
    utype: this.utype,
    role: this.role,
    fname: this.fname,
    lname: this.lname,
    is_active: this.is_active
  });

  // ✅ CRITICAL FIX: Map legacy username to user_name if missing
  if (this.username && !this.user_name) {
    this.user_name = this.username;
    console.log('✅ MAPPED: username -> user_name:', this.user_name);
  }

  // ✅ CRITICAL FIX: Map legacy fname/lname to first_name/last_name
  if (this.fname && !this.first_name) {
    this.first_name = this.fname;
    console.log('✅ MAPPED: fname -> first_name:', this.first_name);
  }
  if (this.lname && !this.last_name) {
    this.last_name = this.lname;
    console.log('✅ MAPPED: lname -> last_name:', this.last_name);
  }

  // ✅ CRITICAL FIX: Map legacy utype to primary_business_role if missing
  if (this.utype && !this.primary_business_role) {
    this.primary_business_role = this.utype;
    console.log('✅ MAPPED: utype -> primary_business_role:', this.primary_business_role);
  }

  // ✅ CRITICAL FIX: Set default primary_business_role if still missing
  if (!this.primary_business_role) {
    this.primary_business_role = 'Staff'; // Default role for legacy users
    console.log('✅ SET DEFAULT: primary_business_role -> Staff');
  }

  // ✅ CRITICAL FIX: Map legacy is_active to status
  if (this.is_active && !this.status) {
    this.status = this.is_active === 'Active' ? 'Active' : 'Deactivated';
    console.log('✅ MAPPED: is_active -> status:', this.status);
  }

  // ✅ CRITICAL FIX: Map legacy role and BU_ROLE_ID
  if (this.role && (!this.roles || this.roles.length === 0)) {
    if (!this.roles) this.roles = [];
    // Convert role to number if it's a string
    const roleNum = typeof this.role === 'string' ? parseInt(this.role) : this.role;
    if (!isNaN(roleNum)) {
      this.roles.push(roleNum);
      console.log('✅ MAPPED: role -> roles:', roleNum);
    }
  }
  
  if (this.BU_ROLE_ID && (!this.roles || this.roles.length === 0)) {
    if (!this.roles) this.roles = [];
    // Convert BU_ROLE_ID to number if it's a string
    const buRoleNum = typeof this.BU_ROLE_ID === 'string' ? parseInt(this.BU_ROLE_ID) : this.BU_ROLE_ID;
    if (!isNaN(buRoleNum)) {
      this.roles.push(buRoleNum);
      console.log('✅ MAPPED: BU_ROLE_ID -> roles:', buRoleNum);
    }
  }

  // Set primary role if not set and we have roles
  if (this.roles && this.roles.length > 0 && !this.primary_role) {
    this.primary_role = this.roles[0];
    console.log('✅ SET: primary_role from first role:', this.primary_role);
  }

  // Map legacy id to user_id
  if (this.id && !this.user_id) {
    this.user_id = this.id;
    console.log('✅ MAPPED: id -> user_id:', this.user_id);
  }

  // Auto-generate user_id if not provided (for new users)
  if (!this.user_id && this.id) {
    this.user_id = this.id;
  }

  // Only hash password if it's modified and not already hashed
  if (!this.isModified('password')) return next();
  
  try {
    if (this.password && !this.password.startsWith('$2')) {
      console.log('⚠️ Unhashed password detected - auto-hashing for security');
      this.password = await bcrypt.hash(this.password, 10);
    } else if (this.isModified('password')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ UPDATED ROLE MANAGEMENT METHODS for Number-based roles

// Get all roles (with fallback to legacy)
userSchema.methods.getAllRoles = function() {
  if (this.roles && this.roles.length > 0) {
    return this.roles;
  }
  // Fallback to legacy single role
  return [this.BU_ROLE_ID].filter(role => role !== null && role !== undefined);
};

// Check if user has a specific role
userSchema.methods.hasRole = function(roleId) {
  const roles = this.getAllRoles();
  const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
  return roles.some(role => role && role.toString() === targetRoleId.toString());
};

// Check if user has any of the specified roles
userSchema.methods.hasAnyRole = function(roleIds) {
  const roles = this.getAllRoles();
  return roleIds.some(roleId => {
    const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
    return roles.some(role => role && role.toString() === targetRoleId.toString());
  });
};

// Check if user has all of the specified roles
userSchema.methods.hasAllRoles = function(roleIds) {
  const roles = this.getAllRoles();
  return roleIds.every(roleId => {
    const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
    return roles.some(role => role && role.toString() === targetRoleId.toString());
  });
};

// Add a role to user
userSchema.methods.addRole = function(roleId) {
  if (!this.roles) {
    this.roles = [];
  }
  
  const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
  const alreadyHasRole = this.roles.some(role => 
    role && role.toString() === targetRoleId.toString()
  );
  
  if (!alreadyHasRole && !isNaN(targetRoleId)) {
    this.roles.push(targetRoleId);
    
    // Set as primary role if this is the first role
    if (this.roles.length === 1 && !this.primary_role) {
      this.primary_role = targetRoleId;
    }
  }
  
  return this.save();
};

// Remove a role from user
userSchema.methods.removeRole = function(roleId) {
  if (!this.roles) return Promise.resolve(this);
  
  const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
  this.roles = this.roles.filter(role => 
    role && role.toString() !== targetRoleId.toString()
  );
  
  // Update primary role if it was removed
  if (this.primary_role && this.primary_role.toString() === targetRoleId.toString()) {
    this.primary_role = this.roles.length > 0 ? this.roles[0] : null;
  }
  
  return this.save();
};

// Set primary role (must be one of the user's roles)
userSchema.methods.setPrimaryRole = function(roleId) {
  const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
  const hasRole = this.roles && this.roles.some(role => 
    role && role.toString() === targetRoleId.toString()
  );
  
  if (hasRole && !isNaN(targetRoleId)) {
    this.primary_role = targetRoleId;
    return this.save();
  }
  
  throw new Error('Cannot set primary role: User does not have this role');
};

// Get primary role (with fallback)
userSchema.methods.getPrimaryRole = function() {
  if (this.primary_role) {
    return this.primary_role;
  }
  
  // Fallback to first role in array
  if (this.roles && this.roles.length > 0) {
    return this.roles[0];
  }
  
  // Fallback to legacy BU_ROLE_ID
  return this.BU_ROLE_ID;
};

// Get role count
userSchema.methods.getRoleCount = function() {
  return this.roles ? this.roles.length : 0;
};

// Clear all roles
userSchema.methods.clearRoles = function() {
  this.roles = [];
  this.primary_role = null;
  return this.save();
};

// Check if password was changed after JWT was issued
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

// 🔹 MODIFIED METHOD: Always allow login (24-hour access)
userSchema.methods.isWithinLoginHours = function() {
  console.log('🔓 24-Hour Login Access Enabled:', {
    user: this.user_name || this.username,
    message: 'Login time restrictions disabled - 24-hour access allowed'
  });
  return true;
};

// 🔹 LEGACY COMPATIBILITY METHODS

// Method to create legacy-compatible session
userSchema.methods.createLegacySession = function(sessionData) {
  // Update legacy token field for compatibility
  this.token = sessionData.session_id || `legacy_${Date.now()}`;
  this.last_updated = new Date();
  
  // Also create modern session
  return this.addLoginSession(sessionData);
};

// Method to validate legacy token
userSchema.methods.validateLegacyToken = function(token) {
  return this.token === token && this.status === 'Active';
};

// Method to get legacy session data
userSchema.methods.getLegacySessionData = function() {
  return {
    id: this.id || this._id.toString(),
    user_id: this.user_id || this._id.toString(),
    token: this.token,
    last_updated: this.last_updated
  };
};

// 🔹 MODERN SESSION MANAGEMENT METHODS

// Add a new login session (updated for legacy compatibility)
userSchema.methods.addLoginSession = function(sessionData) {
  const session = {
    session_id: sessionData.session_id || `session_${Date.now()}`,
    ip_address: sessionData.ip_address,
    user_agent: sessionData.user_agent,
    login_time: new Date(),
    last_activity: new Date(),
    is_active: true
  };
  
  this.current_sessions.push(session);
  this.last_login = new Date();
  
  // Update legacy fields for compatibility
  this.token = session.session_id;
  this.last_updated = new Date();
  
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
    this.last_updated = new Date(); // Update legacy field
    return this.save();
  }
  return Promise.resolve(this);
};

// Logout a specific session
userSchema.methods.logoutSession = function(sessionId, isForced = false) {
  const session = this.current_sessions.find(s => s.session_id === sessionId && s.is_active);
  if (session) {
    session.is_active = false;
    
    // Clear legacy token if this was the active session
    if (this.token === sessionId) {
      this.token = null;
    }
    
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
  
  // Clear legacy token
  this.token = null;
  this.last_updated = now;
  
  return this.save();
};

// Force lock a user due to fraud
userSchema.methods.forceLock = function(adminUserId, reason = 'Suspicious activity detected') {
  this.status = 'ForceLocked';
  this.force_lock_reason = reason;
  this.force_locked_by = adminUserId;
  this.force_locked_at = new Date();
  this.lock_until = null;
  
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

// 🔹 STATIC METHODS WITH LEGACY COMPATIBILITY

// Static method to find user by username with password selected (updated for legacy)
userSchema.statics.findByUsernameWithPassword = function(identifier) {
  return this.findOne({ 
    $or: [
      { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }
    ]
  }).select('+password +passwordHistory +firstLogin');
};

// Static method to find user by legacy user_id
userSchema.statics.findByLegacyUserId = function(userId) {
  return this.findOne({ 
    $or: [
      { user_id: userId },
      { id: userId }
    ]
  });
};

// Static method to find user by legacy token
userSchema.statics.findByLegacyToken = function(token) {
  return this.findOne({ 
    token: token,
    status: 'Active'
  });
};

// Static method to find users by role
userSchema.statics.findByRole = function(roleId) {
  const targetRoleId = typeof roleId === 'string' ? parseInt(roleId) : roleId;
  return this.find({
    $or: [
      { roles: targetRoleId },
      { BU_ROLE_ID: targetRoleId },
      { primary_role: targetRoleId }
    ]
  });
};

// Static method to find users with multiple roles
userSchema.statics.findByMultipleRoles = function(roleIds) {
  const targetRoleIds = roleIds.map(roleId => typeof roleId === 'string' ? parseInt(roleId) : roleId);
  return this.find({
    roles: { $all: targetRoleIds }
  });
};

// Static method to find users with any of the specified roles
userSchema.statics.findByAnyRole = function(roleIds) {
  const targetRoleIds = roleIds.map(roleId => typeof roleId === 'string' ? parseInt(roleId) : roleId);
  return this.find({
    roles: { $in: targetRoleIds }
  });
};

// Static method to migrate legacy roles to new system
userSchema.statics.migrateLegacyRoles = async function() {
  const usersWithLegacyRoles = await this.find({
    $or: [
      { BU_ROLE_ID: { $exists: true, $ne: null } },
      { role: { $exists: true, $ne: null } }
    ],
    $or: [
      { roles: { $exists: false } },
      { roles: { $size: 0 } }
    ]
  });
  
  for (const user of usersWithLegacyRoles) {
    if (user.BU_ROLE_ID && (!user.roles || !user.roles.includes(user.BU_ROLE_ID))) {
      if (!user.roles) user.roles = [];
      user.roles.push(user.BU_ROLE_ID);
    }
    if (user.role && (!user.roles || !user.roles.includes(user.role))) {
      if (!user.roles) user.roles = [];
      user.roles.push(user.role);
    }
    
    // Set primary role
    if (user.roles.length > 0 && !user.primary_role) {
      user.primary_role = user.roles[0];
    }
    
    await user.save();
  }
  
  return usersWithLegacyRoles.length;
};

// Static method to migrate legacy session
userSchema.statics.migrateLegacySession = async function(legacySessionData) {
  const user = await this.findByLegacyUserId(legacySessionData.user_id);
  if (user) {
    // Create modern session from legacy data
    await user.createLegacySession({
      session_id: legacySessionData.token,
      ip_address: 'legacy_migration',
      user_agent: 'legacy_system'
    });
    return user;
  }
  return null;
};

// Get all users with active sessions (legacy compatible)
userSchema.statics.getAllUsersWithActiveSessions = function() {
  return this.find({
    $or: [
      { 'current_sessions.is_active': true },
      { token: { $ne: null } }
    ]
  }).select('user_name username first_name last_name email current_sessions token status last_updated');
};

// Get all currently logged-in users
userSchema.statics.getCurrentlyLoggedInUsers = function() {
  return this.aggregate([
    { 
      $match: { 
        $or: [
          { 'current_sessions.is_active': true },
          { token: { $ne: null } }
        ]
      } 
    },
    { $unwind: { path: '$current_sessions', preserveNullAndEmptyArrays: true } },
    { 
      $match: { 
        $or: [
          { 'current_sessions.is_active': true },
          { token: { $ne: null } }
        ]
      } 
    },
    { $project: {
        user_name: 1,
        username: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        status: 1,
        token: 1,
        last_updated: 1,
        session: '$current_sessions'
      }
    }
  ]);
};

// Force logout all users (admin function)
userSchema.statics.forceLogoutAllUsers = function(adminUserId) {
  return this.updateMany(
    { 
      $or: [
        { 'current_sessions.is_active': true },
        { token: { $ne: null } }
      ]
    },
    { 
      $set: { 
        'current_sessions.$[].is_active': false,
        token: null,
        last_updated: new Date()
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
    .select('user_name username first_name last_name email force_lock_reason force_locked_at force_locked_by');
};

// 🔹 MODIFIED STATIC METHOD: No users have login restrictions
userSchema.statics.getUsersWithLoginRestrictions = function() {
  console.log('🔓 Login restrictions disabled - returning empty list');
  return this.find({
    _id: null
  }).select('user_name username first_name last_name earliest_login_time latest_login_time');
};

// Create and export User model
const User = mongoose.model('User', userSchema);
export default User;