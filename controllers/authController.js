import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';


// Function to generate and save reset token
const generateResetToken = async (user) => {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

    user.reset_token = resetToken;
    user.reset_token_expire = resetTokenExpire;
    await user.save();

    return resetToken;
};

// Login Function
const loginUser = async (req, res) => {
    const { user_name, password } = req.body;

    try {
        const user = await User.findOne({ user_name });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        res.status(200).json({ message: "Login successful", user: user });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
};

// Controller for resetting user password
const resetPassword = async (req, res) => {
    const { reset_token, new_password } = req.body;

    try {
        const user = await User.findOne({ reset_token });

        if (!user) {
            return res.status(400).json({ message: "Invalid reset token" });
        }

        if (user.reset_token_expire < Date.now()) {
            return res.status(400).json({ message: "Reset token has expired" });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        user.password = hashedPassword;
        user.reset_token = null;
        user.reset_token_expire = null;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ message: "Error resetting password", error: error.message });
    }
};

// Controller to handle password reset request
const requestPasswordReset = async (req, res) => {
    const { user_name } = req.body;

    try {
        const user = await User.findOne({ user_name });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const resetToken = await generateResetToken(user);
        console.log(`Reset token for user ${user_name}: ${resetToken}`);

        res.status(200).json({
            message: 'Reset token generated and sent',
            resetToken: resetToken
        });
    } catch (error) {
        console.error("Error generating reset token:", error);
        res.status(500).json({ message: "Error generating reset token", error: error.message });
    }
};

// Admin controller to reset a user's password directly
const resetUsers = async (req, res) => {
    const { user_name, new_password } = req.body;

    try {
        const user = await User.findOne({ user_name });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        user.password = hashedPassword;
        user.reset_token = null;  // Ensure reset token is cleared
        user.reset_token_expire = null; // Ensure reset token expiration is cleared
        await user.save();

        res.status(200).json({ message: `Password for ${user_name} reset successfully` });
    } catch (error) {
        console.error("Error resetting user's password:", error);
        res.status(500).json({ message: "Error resetting password", error: error.message });
    }
};

// Admin Controller: Fetch user details for reset
const fetchUserDetails = async (req, res) => {
    const { user_name } = req.body;

    try {
        const user = await User.findOne({ user_name });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User details fetched successfully", user });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).json({ message: "Error fetching user details", error: error.message });
    }
};

// Controller to reset user login and session
const resetUserLogin = async (req, res) => {
    const { userId } = req.body;

    try {
        // Find user by user_name instead of userId
        const user = await User.findOne({ user_name: userId });

        if (!user) {
            return res.status(400).json({ message: `User with ID ${userId} not found` });
        }

        // Clear reset token and session data
        user.reset_token = null;
        user.reset_token_expire = null;
        await user.save();

        // Optional: Add logic for clearing JWT token or cookies if needed

        res.status(200).json({ message: "User login reset successfully, session refreshed" });

    } catch (error) {
        console.error("Error resetting user login:", error);
        res.status(500).json({ message: "Error resetting user login", error: error.message });
    }
};

export { loginUser, requestPasswordReset, resetPassword, resetUsers, resetUserLogin, fetchUserDetails };