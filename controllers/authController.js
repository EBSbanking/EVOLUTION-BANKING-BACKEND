import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateToken as authGenerateToken } from '../middlewares/authMiddleware.js'; // ✅ ADD THIS IMPORT

// Function to generate and save reset token
const generateResetToken = async (user) => {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

    user.reset_token = resetToken;
    user.reset_token_expire = resetTokenExpire;
    await user.save();

    return resetToken;
};

// ❌ REMOVE THE OLD generateToken FUNCTION - Using the one from authMiddleware instead

// Login Function - UPDATED: Use authMiddleware's generateToken function
const loginUser = async (req, res) => {
    const { user_name, password } = req.body;

    try {
        const user = await User.findOne({ user_name }).select('+password');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            // Increment failed attempts and lock if needed
            user.failed_attempts += 1;
            if (user.failed_attempts >= 5) {
                user.lock_until = new Date(Date.now() + 30 * 60 * 1000);  // Lock for 30 min
            }
            await user.save();
            
            return res.status(401).json({ 
                success: false, 
                message: "Invalid credentials" 
            });
        }

        // Reset failed attempts on successful login
        user.failed_attempts = 0;
        user.lock_until = null;
        await user.save();

        // ✅ USE THE AUTH MIDDLEWARE'S generateToken FUNCTION
        const token = authGenerateToken(user);

        // Enhanced user data response with all required fields
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
            user: userData 
        });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error logging in", 
            error: error.message 
        });
    }
};

// Controller for resetting user password - UPDATED
const resetPassword = async (req, res) => {
    const { reset_token, new_password } = req.body;

    try {
        const user = await User.findOne({ 
            reset_token, 
            reset_token_expire: { $gt: Date.now() }  // Ensure not expired
        }).select('+password +passwordHistory');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid or expired reset token" 
            });
        }

        // Password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(new_password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as the current password'
            });
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
                    failed_attempts: 0,
                    lock_until: null,
                },
            }
        );

        // ✅ USE THE AUTH MIDDLEWARE'S generateToken FUNCTION
        const token = authGenerateToken(user);

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
        const user = await User.findOne({ user_name }).select('+password +passwordHistory');

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(new_password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
            });
        }

        // Check if new password is same as current
        const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
        if (isSameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: 'New password cannot be the same as the current password'
            });
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
                    failed_attempts: 0,
                    lock_until: null,
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

export { loginUser, requestPasswordReset, resetPassword, resetUsers, resetUserLogin, fetchUserDetails, debugUserData };