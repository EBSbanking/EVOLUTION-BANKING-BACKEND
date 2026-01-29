// controllers/authController.js
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateToken as authGenerateToken } from '../middlewares/authMiddleware.js';
import Login from '../models/Login.js'; // Import the Login model

// Function to generate and save reset token
const generateResetToken = async (user) => {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

    user.reset_token = resetToken;
    user.reset_token_expire = resetTokenExpire;
    await user.save();

    return resetToken;
};

// Function to generate temporary token for password change
const generateTempToken = async (userId) => {
    const tempToken = crypto.randomBytes(32).toString('hex');
    const tempTokenExpire = Date.now() + 600 * 1000; // 10 minutes from now
    
    // Store temp token in user record (or separate collection for better security)
    await User.findByIdAndUpdate(userId, {
        temp_password_token: tempToken,
        temp_token_expire: tempTokenExpire
    });
    
    return tempToken;
};

// Validate password strength
const validatePasswordStrength = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength) {
        return { valid: false, message: `Password must be at least ${minLength} characters long` };
    }
    if (!hasUpperCase) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumbers) {
        return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!hasSpecialChar) {
        return { valid: false, message: 'Password must contain at least one special character' };
    }

    return { valid: true, message: 'Password is strong' };
};

// Function to log login attempts
const logLoginAttempt = async (user_id, username, ip_address, user_agent, status, error, error_code = null, session_id = null, password_changed = false) => {
    try {
        await Login.create({
            user_id: user_id,
            user_name: username,
            username: username,
            ip_address: ip_address,
            user_agent: user_agent,
            session_id: session_id,
            status: status,
            success: status === 'Success',
            error: error,
            error_code: error_code,
            attempt_identifier: username,
            login_type: 'password',
            device_type: 'unknown',
            location_data: {},
            failed_attempts_count: status === 'Failed' ? 1 : 0,
            password_changed: password_changed
        });
    } catch (error) {
        console.error('Error logging login attempt:', error);
    }
};

// Updated Login Function with first-time password change enforcement
const loginUser = async (req, res) => {
    const { user_name, password } = req.body;

    // Get client information
    const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];
    const session_id = req.sessionID;

    try {
        const user = await User.findOne({ user_name }).select('+password +default_password +passwordHistory +temp_password_token +temp_token_expire');

        if (!user) {
            await logLoginAttempt(null, user_name, ip_address, user_agent, 'Failed', 'User not found', 'USER_NOT_FOUND');
            return res.status(401).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }

        // Check if account is locked
        if (user.lock_until && user.lock_until > new Date()) {
            await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 'Failed', 'Account is locked', 'ACCOUNT_LOCKED');
            return res.status(401).json({ 
                success: false, 
                message: "Account is locked. Please try again later." 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        const isDefaultPassword = user.default_password 
            ? await bcrypt.compare(password, user.default_password)
            : false;

        // First-time login check: if using default password OR user has never changed password
        const isFirstLogin = isDefaultPassword || 
                           (user.passwordChangedAt === null && user.is_first_login === true);

        if (!isMatch && !isDefaultPassword) {
            // Regular failed login attempt
            user.failed_attempts = (user.failed_attempts || 0) + 1;
            if (user.failed_attempts >= 5) {
                user.lock_until = new Date(Date.now() + 30 * 60 * 1000);  // Lock for 30 min
            }
            await user.save();
            
            await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 'Failed', 'Invalid password', 'INVALID_PASSWORD');
            
            return res.status(401).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }

        // Reset failed attempts on successful login
        user.failed_attempts = 0;
        user.lock_until = null;
        user.last_login = new Date();
        await user.save();

        // If first login or using default password, require password change
        if (isFirstLogin) {
            // Generate temporary token for password change flow
            const tempToken = await generateTempToken(user._id);
            
            await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 
                'Success', 'First login - password change required', 'FIRST_LOGIN_REQUIRED', session_id, false);
            
            // Enhanced user data response
            const userData = {
                userId: user._id,
                user_name: user.user_name,
                email: user.email || '',
                role: user.role || 'user',
                BU_ROLE_ID: user.BU_ROLE_ID,
                businessUnit: user.businessUnit,
                accessibleBusinessUnits: user.accessibleBusinessUnits || [],
                permissions: user.permissions,
                isAdmin: user.isAdmin,
                primary_business_role: user.primary_business_role
            };

            return res.status(200).json({ 
                success: true, 
                message: "Login successful. Please change your default password.", 
                requires_password_change: true,
                temp_token: tempToken,
                user: userData,
                reason: isDefaultPassword ? 'default_password' : 'first_login'
            });
        }

        // Check if password has expired
        if (user.password_expiry_date && new Date() > user.password_expiry_date) {
            const tempToken = await generateTempToken(user._id);
            
            await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 
                'Success', 'Password expired - change required', 'PASSWORD_EXPIRED', session_id, false);
            
            const userData = {
                userId: user._id,
                user_name: user.user_name,
                email: user.email || '',
                role: user.role || 'user',
                BU_ROLE_ID: user.BU_ROLE_ID,
                businessUnit: user.businessUnit,
                accessibleBusinessUnits: user.accessibleBusinessUnits || [],
                permissions: user.permissions,
                isAdmin: user.isAdmin,
                primary_business_role: user.primary_business_role
            };

            return res.status(200).json({ 
                success: true, 
                message: "Your password has expired. Please change it.", 
                requires_password_change: true,
                temp_token: tempToken,
                user: userData,
                reason: 'password_expired'
            });
        }

        // Regular successful login
        const token = authGenerateToken(user);
        
        await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 
            'Success', null, null, session_id, false);

        // Enhanced user data response
        const userData = {
            userId: user._id,
            user_name: user.user_name,
            email: user.email || '',
            role: user.role || 'user',
            BU_ROLE_ID: user.BU_ROLE_ID,
            businessUnit: user.businessUnit,
            accessibleBusinessUnits: user.accessibleBusinessUnits || [],
            permissions: user.permissions,
            isAdmin: user.isAdmin,
            primary_business_role: user.primary_business_role,
            tokenIssuedAt: new Date(),
            tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        };

        res.status(200).json({ 
            success: true, 
            message: "Login successful", 
            token, 
            user: userData,
            requires_password_change: false
        });
    } catch (error) {
        console.error("Error logging in:", error);
        await logLoginAttempt(null, user_name, ip_address, user_agent, 'Failed', error.message, 'SYSTEM_ERROR');
        res.status(500).json({ 
            success: false, 
            message: "Error logging in", 
            error: error.message 
        });
    }
};

// Controller for changing password (for first-time login and regular changes)
const changePassword = async (req, res) => {
    const { user_id, old_password, new_password, temp_token } = req.body;

    try {
        const user = await User.findById(user_id).select('+password +default_password +passwordHistory +temp_password_token +temp_token_expire');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // If using temp token (for first login/forced change), skip old password check
        if (temp_token) {
            // Validate temp token
            if (user.temp_password_token !== temp_token || 
                !user.temp_token_expire || 
                user.temp_token_expire < Date.now()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired token'
                });
            }
        } else {
            // Regular password change - check old password
            const isOldPasswordValid = await bcrypt.compare(old_password, user.password);
            if (!isOldPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }
        }

        // Password strength validation
        const passwordValidation = validatePasswordStrength(new_password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.message
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as current password'
            });
        }

        // Check if new password is same as default password
        if (user.default_password) {
            const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
            if (isSameAsDefault) {
                return res.status(400).json({
                    success: false,
                    message: 'New password cannot be the same as default password'
                });
            }
        }

        // Check password history for reuse (keep last 5 passwords)
        if (user.passwordHistory && user.passwordHistory.length > 0) {
            for (const oldHash of user.passwordHistory) {
                const isPrevious = await bcrypt.compare(new_password, oldHash);
                if (isPrevious) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot reuse previous passwords'
                    });
                }
            }
        }

        // Hash and save new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        // Update password history (keep last 5)
        const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

        // Update user
        user.password = hashedPassword;
        user.passwordHistory = updatedHistory;
        user.passwordChangedAt = new Date();
        user.is_first_login = false;
        user.temp_password_token = null;
        user.temp_token_expire = null;
        
        // Set password expiry (e.g., 90 days from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        user.password_expiry_date = expiryDate;
        
        await user.save();

        // Generate new token after password change
        const token = authGenerateToken(user);

        // Log the password change in login history
        const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const user_agent = req.headers['user-agent'];
        await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 
            'Success', 'Password changed', null, req.sessionID, true);

        // Enhanced user data response
        const userData = {
            userId: user._id,
            user_name: user.user_name,
            email: user.email || '',
            role: user.role || 'user',
            BU_ROLE_ID: user.BU_ROLE_ID,
            businessUnit: user.businessUnit,
            accessibleBusinessUnits: user.accessibleBusinessUnits || [],
            permissions: user.permissions,
            isAdmin: user.isAdmin,
            primary_business_role: user.primary_business_role
        };

        res.status(200).json({ 
            success: true, 
            message: "Password changed successfully", 
            token,
            user: userData
        });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error changing password", 
            error: error.message 
        });
    }
};

// Controller for resetting user password (forgot password flow) - UPDATED
const resetPassword = async (req, res) => {
    const { reset_token, new_password } = req.body;

    try {
        const user = await User.findOne({ 
            reset_token, 
            reset_token_expire: { $gt: Date.now() }  // Ensure not expired
        }).select('+password +passwordHistory +default_password');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid or expired reset token" 
            });
        }

        // Password strength validation
        const passwordValidation = validatePasswordStrength(new_password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.message
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as current password'
            });
        }

        // Check if new password is same as default password
        if (user.default_password) {
            const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
            if (isSameAsDefault) {
                return res.status(400).json({
                    success: false,
                    message: 'New password cannot be the same as default password'
                });
            }
        }

        // Check password history for reuse
        if (user.passwordHistory && user.passwordHistory.length > 0) {
            for (const oldHash of user.passwordHistory) {
                const isPrevious = await bcrypt.compare(new_password, oldHash);
                if (isPrevious) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot reuse previous passwords'
                    });
                }
            }
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Update password history (keep last 5, including current before update)
        const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    passwordHistory: updatedHistory,
                    reset_token: null,
                    reset_token_expire: null,
                    passwordChangedAt: new Date(),
                    is_first_login: false,
                    failed_attempts: 0,
                    lock_until: null,
                    // Set password expiry
                    password_expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                },
            }
        );

        // Generate token for immediate login
        const token = authGenerateToken(user);

        // Log the password reset
        const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const user_agent = req.headers['user-agent'];
        await logLoginAttempt(user._id, user.user_name, ip_address, user_agent, 
            'Success', 'Password reset via token', null, req.sessionID, true);

        res.status(200).json({ 
            success: true, 
            message: "Password reset successfully", 
            token  // Include token for immediate login
        });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error resetting password", 
            error: error.message 
        });
    }
};

// Controller to handle password reset request
const requestPasswordReset = async (req, res) => {
    const { user_name } = req.body;

    try {
        const user = await User.findOne({ user_name }).select('+reset_token +reset_token_expire');

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Check if token already exists and is valid
        if (user.reset_token && user.reset_token_expire > Date.now()) {
            return res.status(400).json({ 
                success: false, 
                message: "Reset token already generated. Please check your email." 
            });
        }

        const resetToken = await generateResetToken(user);
        console.log(`Reset token for user ${user_name}: ${resetToken}`);

        // In production, send email with resetToken; here, return it directly for testing
        res.status(200).json({
            success: true,
            message: 'Reset token generated and sent',
            resetToken: resetToken  // Remove in production; use email service
        });
    } catch (error) {
        console.error("Error generating reset token:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error generating reset token", 
            error: error.message 
        });
    }
};

// Admin controller to reset a user's password directly
const resetUsers = async (req, res) => {
    const { user_name, new_password } = req.body;

    try {
        const user = await User.findOne({ user_name }).select('+password +passwordHistory +default_password');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Password strength validation
        const passwordValidation = validatePasswordStrength(new_password);
        if (!passwordValidation.valid) {
            return res.status(400).json({
                success: false,
                message: passwordValidation.message
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as current password'
            });
        }

        // Check if new password is same as default password
        if (user.default_password) {
            const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
            if (isSameAsDefault) {
                return res.status(400).json({
                    success: false,
                    message: 'New password cannot be the same as default password'
                });
            }
        }

        // Check password history for reuse
        if (user.passwordHistory && user.passwordHistory.length > 0) {
            for (const oldHash of user.passwordHistory) {
                const isPrevious = await bcrypt.compare(new_password, oldHash);
                if (isPrevious) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot reuse previous passwords'
                    });
                }
            }
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        // Update password history
        const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashedPassword,
                    passwordHistory: updatedHistory,
                    reset_token: null,  // Ensure reset token is cleared
                    reset_token_expire: null, // Ensure reset token expiration is cleared
                    passwordChangedAt: new Date(),
                    is_first_login: false,
                    failed_attempts: 0,
                    lock_until: null,
                    // Set default password to null when admin resets it
                    default_password: null,
                    // Set password expiry
                    password_expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                },
            }
        );

        res.status(200).json({ 
            success: true, 
            message: `Password for ${user_name} reset successfully` 
        });
    } catch (error) {
        console.error("Error resetting user's password:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error resetting password", 
            error: error.message 
        });
    }
};

// Admin Controller: Fetch user details for reset
const fetchUserDetails = async (req, res) => {
    const { user_name } = req.body;

    try {
        const user = await User.findOne({ user_name }).select('-password');  // Exclude sensitive fields

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: "User details fetched successfully", 
            user 
        });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error fetching user details", 
            error: error.message 
        });
    }
};

// Controller to reset user login and session
const resetUserLogin = async (req, res) => {
    const { userId } = req.body;

    try {
        // Find user by user_name instead of userId (assuming userId is user_name)
        const user = await User.findOne({ user_name: userId });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: `User with ID ${userId} not found` 
            });
        }

        // Clear reset token and session data
        user.reset_token = null;
        user.reset_token_expire = null;
        user.temp_password_token = null;
        user.temp_token_expire = null;
        user.failed_attempts = 0;
        user.lock_until = null;
        await user.save();

        res.status(200).json({ 
            success: true, 
            message: "User login reset successfully, session refreshed" 
        });

    } catch (error) {
        console.error("Error resetting user login:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error resetting user login", 
            error: error.message 
        });
    }
};

// Add this to your authController.js temporarily
const debugUserData = async (req, res) => {
    try {
        const user = await User.findOne({ user_name: 'PCO03' });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('🔍 User Document Fields:', Object.keys(user.toObject()));
        console.log('🔍 User Business Unit Data:', {
            businessUnit: user.businessUnit,
            BU_ROLE_ID: user.BU_ROLE_ID,
            accessibleBusinessUnits: user.accessibleBusinessUnits,
            hasBusinessUnit: !!user.businessUnit
        });

        res.json({
            success: true,
            user: user.toObject(),
            hasBusinessUnit: !!user.businessUnit,
            businessUnit: user.businessUnit
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

// Controller to validate temp token for password change
const validateTempToken = async (req, res) => {
    const { user_id, temp_token } = req.body;

    try {
        const user = await User.findById(user_id).select('+temp_password_token +temp_token_expire');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        if (user.temp_password_token !== temp_token || 
            !user.temp_token_expire || 
            user.temp_token_expire < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Token is valid',
            user_name: user.user_name
        });
    } catch (error) {
        console.error("Error validating token:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error validating token", 
            error: error.message 
        });
    }
};

export { 
    loginUser, 
    requestPasswordReset, 
    resetPassword, 
    resetUsers, 
    resetUserLogin, 
    fetchUserDetails, 
    debugUserData,
    changePassword,
    validateTempToken 
};