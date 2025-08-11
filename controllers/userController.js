import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import UserRole from '../models/UserRole.js';
import asyncHandler from 'express-async-handler';

dotenv.config(); // Load environment variables

// ✅ Register User
export const registerUser = asyncHandler(async (req, res) => {
  const {
    user_name,
    password,
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
    primary_business_role, // This is expected to be a role name (string) or ObjectId (if ref used)
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
    status,
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [
      { email: new RegExp(`^${email}$`, 'i') },
      { user_name: new RegExp(`^${user_name}$`, 'i') },
    ],
  });

  if (existingUser) {
    return res.status(409).json({ message: 'User already exists' });
  }

  // Optional: Validate role exists in UserRole model if you're using role reference
  let roleExists = null;
  if (primary_business_role) {
    roleExists = await UserRole.findOne({ role: primary_business_role });
    if (!roleExists) {
      return res.status(400).json({ message: `Role "${primary_business_role}" does not exist.` });
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
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
    primary_business_role: roleExists ? roleExists.role : primary_business_role,
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
    status,
  });

  await newUser.save();

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: newUser._id,
      user_name: newUser.user_name,
      email: newUser.email,
      role: newUser.primary_business_role,
      status: newUser.status,
    },
  });
});



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
