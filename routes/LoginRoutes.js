import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';  // Import Nodemailer for email functionality
import auth from '../middlewares/auth.js'; // Import the authentication middleware
import dotenv from 'dotenv'; // To load environment variables

dotenv.config();  // Load environment variables from a .env file

const router = express.Router();

// Middleware to generate and save reset token
const generateResetToken = async (user) => {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

    user.reset_token = resetToken;
    user.reset_token_expire = resetTokenExpire;
    await user.save(); 

    return resetToken;
};

// Setup email transporter using Nodemailer (using environment variables for credentials)
const transporter = nodemailer.createTransport({
    service: 'gmail',  // Corrected service name for Gmail
    auth: {
        user: process.env.EMAIL_USER,  // Store in .env for security
        pass: process.env.EMAIL_PASS   // Store in .env for security
    }
});

// Send Reset Token Email
const sendResetTokenEmail = (email, resetToken) => {
    const resetLink = `http://localhost:5000/reset-password?token=${resetToken}`;  // Link to reset password
    const mailOptions = {
        from: process.env.EMAIL_USER,  // Use environment variable
        to: email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Please use the following token to reset your password: ${resetToken}\nOr click on this link: ${resetLink}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
};

// Route to create a new user
router.post('/admin/create-user', async (req, res) => {
    const { user_name, email, password, main_business_unit } = req.body;

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ user_name });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({
            user_name,
            email,
            password: hashedPassword,
            main_business_unit
        });

        // Save the user to the database
        await newUser.save();

        res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Error creating user", error: error.message });
    }
});

// Request Password Reset Route (sends reset token via email)
router.post('/request-password-reset', async (req, res) => {
    const { userId } = req.body;

    try {
        console.log('Request userId:', userId); // Log the userId received

        // Assuming userId is not the primary _id, use findOne instead of findById
        const user = await User.findOne({ userId: userId });

        console.log('Found user:', user); // Log the user object if found

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const resetToken = await generateResetToken(user);

        // Send the generated reset token via email
        sendResetTokenEmail(user.email, resetToken);

        res.status(200).json({
            message: 'Reset token generated and sent to email',
            resetToken
        });
    } catch (error) {
        console.error("Error generating reset token:", error);
        res.status(500).json({ message: "Error generating reset token", error: error.message });
    }
});

// // Reset Password Route (actually updates the password)
// router.post('/reset-password', async (req, res) => {
//     const { reset_token, new_password } = req.body;

//     if (!new_password || new_password.length < 6) {
//         return res.status(400).json({ message: "New password is required and should be at least 6 characters long" });
//     }

//     try {
//         const user = await User.findOne({ reset_token });

//         if (!user) {
//             return res.status(400).json({ message: "Invalid reset token" });
//         }

//         if (user.reset_token_expire < Date.now()) {
//             return res.status(400).json({ message: "Reset token has expired" });
//         }

//         // Hash the new password
//         const hashedPassword = await bcrypt.hash(new_password, 10);
        
//         user.password = hashedPassword;
//         user.reset_token = null;  
//         user.reset_token_expire = null; 
//         await user.save();

//         res.status(200).json({ message: "Password reset successfully" });
//     } catch (error) {
//         console.error("Error resetting password:", error);
//         res.status(500).json({ message: "Error resetting password", error: error.message });
//     }
// });

// Admin Controller: Reset a user's password directly
router.put('/admin/reset-password', async (req, res) => {
    const { user_name, new_password } = req.body;

    if (!new_password || new_password.length < 6) {
        return res.status(400).json({ message: "New password is required and should be at least 6 characters long" });
    }

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
});

// Admin Controller: Fetch user details for reset
router.post('/admin/fetch-user-details', async (req, res) => {  // Changed to POST as it's fetching details
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
});

// Controller for logging in a user
router.post('/login', async (req, res) => {
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

        res.status(200).json({ message: "Login successful", user });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
});

// Example protected route (requires authentication)
router.get('/protected', auth, (req, res) => {
    res.status(200).json({ message: "This is a protected route.", user: req.user });
});

// Controller for searching a user by main_business_unit
router.get('/search-by-business-unit', async (req, res) => {
    const { main_business_unit } = req.query;

    if (!main_business_unit) {
        return res.status(400).json({ message: "Main business unit is required" });
    }

    try {
        const users = await User.find({ main_business_unit });

        if (!users || users.length === 0) {
            return res.status(400).json({ message: "No users found for the provided main business unit" });
        }

        res.status(200).json({ message: "Users found", users });
    } catch (error) {
        console.error("Error searching for users:", error);
        res.status(500).json({ message: "Error searching for users", error: error.message });
    }
});

// Route to get a user by their UserId (or custom user identifier)
router.get('/login/user/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // Replace "user_name" with the actual field name where "PCO004" is stored
        const user = await User.findOne({ user_name: userId });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ message: "User fetched successfully", user });
    } catch (error) {
        console.error("Error fetching user by UserId:", error);
        res.status(500).json({ message: "Error fetching user", error: error.message });
    }
});

router.post('/reset-user-login', async (req, res) => {
    const { userId } = req.body;

    try {
        console.log("Searching for user with ID:", userId); // Debug log

        // Find the user by userId
        const user = await User.findOne({ userId });

        if (!user) {
            return res.status(404).json({ message: `User with ID ${userId} not found` });
        }

        // Clear reset token and expire time
        user.reset_token = null;
        user.reset_token_expire = null;
        await user.save();

        res.status(200).json({ message: "User login reset successfully, session refreshed" });

    } catch (error) {
        console.error("Error resetting user login:", error);
        res.status(500).json({ message: "Error resetting user login", error: error.message });
    }
});

export default router;
