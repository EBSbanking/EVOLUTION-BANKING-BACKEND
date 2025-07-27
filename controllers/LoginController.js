import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Login from '../models/Login.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { v4 as uuidv4 } from 'uuid'; // ✅ UUID import here

export const login = async (req, res) => {
  const { user_name, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } },
        { email: { $regex: new RegExp(`^${user_name}$`, 'i') } },
        { employer_number: user_name }
      ]
    }).select('+user_name +password +status +failed_attempts +lock_until');

    // ❌ User not found
    if (!user) {
      await Login.create({
        attempt_identifier: uuidv4(),
        user_id: null,
        user_name,
        login_time: new Date(),
        ip_address: req.ip,
        status: 'Failed',
        error: 'User not found'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        resolution: 'Check your username/email/employee number'
      });
    }

    // ❌ Inactive account
    if (user.status !== 'Active') {
      await Login.create({
        attempt_identifier: uuidv4(),
        user_id: user._id,
        user_name: user.user_name,
        login_time: new Date(),
        ip_address: req.ip,
        status: 'Failed',
        error: `Account ${user.status}`
      });

      return res.status(403).json({
        success: false,
        message: 'Account not active',
        accountStatus: user.status,
        resolution: 'Contact administrator'
      });
    }

    // ❌ Account locked
    if (user.lock_until && user.lock_until > Date.now()) {
      const remainingTime = Math.ceil((user.lock_until - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: 'Account temporarily locked',
        resolution: `Try again in ${remainingTime} minutes`,
        failedAttempts: user.failed_attempts
      });
    }

    // ❌ Incorrect password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const newAttempts = user.failed_attempts + 1;
      const updates = { $inc: { failed_attempts: 1 } };

      if (newAttempts >= 5) {
        updates.$set = { lock_until: Date.now() + 30 * 60 * 1000 };
      }

      await User.updateOne({ _id: user._id }, updates);

      await Login.create({
        attempt_identifier: uuidv4(),
        user_id: user._id,
        user_name: user.user_name,
        login_time: new Date(),
        ip_address: req.ip,
        status: 'Failed',
        error: 'Incorrect password'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        resolution: newAttempts >= 4 ? 'Last attempt before lock' : 'Check your password',
        remainingAttempts: 5 - newAttempts
      });
    }

    // ✅ Successful login - reset lock counters
    await User.updateOne(
      { _id: user._id },
      { $set: { failed_attempts: 0, lock_until: null, last_login: Date.now() } }
    );

    const userRoles = await UserRole.find({ USER_ID: user.user_name });
    const activeRoles = userRoles.filter(r =>
      ['Y', 'Active'].includes(String(r.REC_ST).toUpperCase())
    );

    const isSystemAdmin = user.primary_business_role === 'Administrator';
    const hasAdminRole = activeRoles.some(r => r.ROLE_NM === 'Administrator');
    const isAdmin = isSystemAdmin || hasAdminRole;

    const permissions = isAdmin
      ? ROLE_MAPPING['1'].permissions
      : activeRoles.reduce((acc, role) => ({
          ...acc,
          ...(ROLE_MAPPING[role.ROLE_ID]?.permissions || {})
        }), {});

    const token = jwt.sign(
      {
        userId: user._id,
        user_name: user.user_name,
        email: user.email,
        role: isAdmin ? 'Administrator' : activeRoles[0]?.ROLE_NM || 'User',
        roles: activeRoles.map(r => r.ROLE_NM),
        isAdmin,
        businessUnit: user.main_business_unit,
        permissions,
        accessibleBusinessUnits: isAdmin ? ['ALL'] : [user.main_business_unit]
      },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '8h' }
    );

    // ✅ Log successful login
    await Login.create({
      attempt_identifier: uuidv4(),
      user_id: user._id,
      user_name: user.user_name,
      login_time: new Date(),
      ip_address: req.ip,
      status: 'Success'
    });

    const { password: _, ...userData } = user.toObject();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        ...userData,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        authLevel: isAdmin ? 'admin' : 'user'
      },
      systemInfo: {
        serverTime: new Date(),
        tokenExpiry: new Date(Date.now() + 8 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    await Login.create({
      attempt_identifier: uuidv4(),
      user_id: null,
      user_name,
      login_time: new Date(),
      ip_address: req.ip,
      status: 'Failed',
      error: error.message
    });

    res.status(500).json({
      success: false,
      message: 'Authentication service unavailable',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      referenceId: `AUTH-${Date.now()}`
    });
  }
};

export default Login;
