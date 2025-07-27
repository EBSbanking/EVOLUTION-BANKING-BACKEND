import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js'; // User model
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import UserRole from '../models/UserRole.js';
import asyncHandler from 'express-async-handler';
import { generateToken } from '../middlewares/authMiddleware.js';




dotenv.config(); // Load .env variables

// ✅ Register User
export const registerUser = async (req, res) => {
  try {
    const {
      user_name, password, employer_number, first_name, last_name, middle_name, preferred_name,
      job_title, email, customer_number, main_business_unit, responsibility_centre,
      primary_business_role, start_date, expiry_date, earliest_login_time, latest_login_time,
      internal_employee_enabled, relationship_officer, enable_multi_session, validate_ip_address,
      note, ip_address, is_supervisor, is_main_BU, status
    } = req.body;

    const existingUser = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${email}$`, 'i') } },
        { user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } }
      ]
    });

    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      user_name,
      password: hashedPassword,
      employer_number,
      first_name,
      last_name,
      middle_name,
      preferred_name,
      job_title,
      email,
      customer_number,
      main_business_unit,
      responsibility_centre,
      primary_business_role,
      start_date,
      expiry_date,
      earliest_login_time,
      latest_login_time,
      internal_employee_enabled,
      relationship_officer,
      enable_multi_session,
      validate_ip_address,
      note,
      ip_address,
      is_supervisor,
      is_main_BU,
      status
    });

    await newUser.save();

    res.status(201).json({ message: 'User registered successfully', user: newUser });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};


// // ✅ Login User with Role-Based JWT
// export const login = async (req, res) => {
//   const { user_name, password } = req.body;

//   try {
//     // 1. Find user with case-insensitive match and include password
//     const user = await User.findOne({ 
//       user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } 
//     }).select('+password +status +failed_attempts +lock_until');
    
//     if (!user) {
//       console.error('Login failed - User not found:', user_name);
//       return res.status(401).json({ 
//         success: false,
//         message: 'Invalid credentials',
//         resolution: 'Check your username'
//       });
//     }

//     // 2. Check account status
//     if (user.status !== 'Active') {
//       return res.status(403).json({
//         success: false,
//         message: 'Account is not active',
//         resolution: 'Contact your administrator',
//         accountStatus: user.status
//       });
//     }

//     // 3. Check if account is temporarily locked
//     if (user.lock_until && user.lock_until > Date.now()) {
//       const remainingTime = Math.ceil((user.lock_until - Date.now()) / (60 * 1000));
//       return res.status(403).json({
//         success: false,
//         message: 'Account temporarily locked',
//         resolution: `Try again in ${remainingTime} minutes`,
//         failedAttempts: user.failed_attempts
//       });
//     }

//     // 4. Verify password
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       // Increment failed attempts and potentially lock account
//       const newAttempts = user.failed_attempts + 1;
//       const updates = { $inc: { failed_attempts: 1 } };
      
//       if (newAttempts >= 5) {
//         updates.$set = { lock_until: Date.now() + 30 * 60 * 1000 }; // Lock for 30 minutes
//       }
      
//       await User.updateOne({ _id: user._id }, updates);
      
//       return res.status(401).json({ 
//         success: false,
//         message: 'Invalid credentials',
//         resolution: newAttempts >= 4 ? 
//           `Last attempt before lock` : 
//           'Check your password',
//         remainingAttempts: 5 - newAttempts
//       });
//     }

//     // 5. Reset security counters on successful login
//     await User.updateOne(
//       { _id: user._id },
//       { $set: { failed_attempts: 0, lock_until: null } }
//     );

//     // 6. Get user roles and determine admin status
//     const userRoles = await UserRole.find({ USER_ID: user.user_name });
//     const activeRoles = userRoles.filter(role => 
//       ['Y', 'Active'].includes(String(role.REC_ST).toUpperCase())
//     );

//     const isSystemAdmin = user.primary_business_role === 'Administrator';
//     const hasAdminRole = activeRoles.some(r => r.ROLE_NM === 'Administrator');
//     const isAdmin = isSystemAdmin || hasAdminRole;

//     // 7. Get permissions from ROLE_MAPPING configuration
//     const permissions = isAdmin ? 
//       ROLE_MAPPING['1'].permissions : // Administrator permissions
//       activeRoles.reduce((acc, role) => ({
//         ...acc,
//         ...(ROLE_MAPPING[role.ROLE_ID]?.permissions || {})
//       }), {});

//     // 8. Generate JWT token with comprehensive claims
//     const token = jwt.sign(
//       {
//         userId: user._id,
//         user_name: user.user_name,
//         email: user.email,
//         role: isAdmin ? 'Administrator' : activeRoles[0]?.ROLE_NM || 'User',
//         roles: activeRoles.map(r => r.ROLE_NM),
//         isAdmin,
//         businessUnit: user.main_business_unit,
//         permissions,
//         accessibleBusinessUnits: isAdmin ? 
//           ['ALL BUSINESS UNITS'] : 
//           [user.main_business_unit],
//         authLevel: isAdmin ? 'admin' : 'user'
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: '8h' }
//     );

//     // 9. Prepare user data for response
//     const userData = {
//       id: user._id,
//       username: user.user_name,
//       name: `${user.first_name} ${user.last_name}`,
//       role: isAdmin ? 'Administrator' : activeRoles[0]?.ROLE_NM,
//       isAdmin,
//       businessUnit: user.main_business_unit,
//       lastLogin: new Date()
//     };

//     // 10. Set secure HTTP-only cookie
//     res.cookie('authToken', token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'strict',
//       maxAge: 8 * 60 * 60 * 1000 // 8 hours
//     });

//     // 11. Send success response
//     res.status(200).json({
//       success: true,
//       message: 'Login successful',
//       token, // For clients that need it
//       user: userData,
//       systemInfo: {
//         serverTime: new Date(),
//         tokenExpiry: new Date(Date.now() + 8 * 60 * 60 * 1000)
//       }
//     });

//   } catch (error) {
//     console.error('Login error:', {
//       error: error.message,
//       stack: error.stack,
//       attemptedUser: user_name,
//       timestamp: new Date()
//     });
    
//     res.status(500).json({
//       success: false,
//       message: 'Authentication service unavailable',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined,
//       referenceId: `AUTH-ERR-${Date.now()}`,
//       supportContact: 'support@yourbank.com'
//     });
//   }
// };




// ✅ Update User
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    const user = await User.findOne({ user_name: userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updatedUser = await User.findOneAndUpdate({ user_name: userId }, updateData, { new: true });
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// ✅ Deactivate User
export const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ user_name: userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.status = 'Deactivated';
    await user.save();

    res.status(200).json({ message: 'User deactivated successfully', user });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Error deactivating user', error: error.message });
  }
};

// ✅ Get User by Employer Number
export const getUserByEmployerNumber = async (req, res) => {
  try {
    const { employer_number } = req.params;
    const user = await User.findOne({ employer_number });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ message: 'User found', user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
};

// ✅ Get All Users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    if (users.length === 0) return res.status(404).json({ message: 'No users found' });

    res.status(200).json({ message: 'Users fetched successfully', users });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

// ✅ Reset Password with History Check
export const resetPassword = async (req, res) => {
  try {
    const { user_name, newPassword, confirmPassword } = req.body;

    if (!user_name || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password is required and should be at least 6 characters long'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const user = await User.findOne({
      user_name: { $regex: new RegExp(`^${user_name}$`, 'i') }
    }).select('+password +passwordHistory');

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({ message: 'New password cannot be the same as current password' });
    }

    if (user.passwordHistory) {
      const isPreviousPassword = await Promise.all(
        user.passwordHistory.map(oldHash => bcrypt.compare(newPassword, oldHash))
      );
      if (isPreviousPassword.includes(true)) {
        return res.status(400).json({ message: 'Cannot reuse any of your last 5 passwords' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

    user.password = hashedPassword;
    user.passwordHistory = updatedHistory;
    user.passwordChangedAt = Date.now();

    await user.save();
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export default {
  registerUser,
  // login,
  updateUser,
  deactivateUser,
  getUserByEmployerNumber,
  getAllUsers,
  resetPassword
};
