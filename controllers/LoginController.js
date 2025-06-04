// import express from 'express';
// import bcrypt from 'bcryptjs';
// import User from '../models/User.js';
// import crypto from 'crypto';
// import auth from '../middlewares/auth.js'; // Import the authentication middleware

// const router = express.Router();

// // Middleware to generate and save reset token
// const generateResetToken = async (user) => {
//     const resetToken = crypto.randomBytes(32).toString('hex');
//     const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

//     user.reset_token = resetToken;
//     user.reset_token_expire = resetTokenExpire;
//     await user.save(); 

//     return resetToken;
// };

// // Login Route
// router.post('/login', async (req, res) => {
//     const { user_name, password } = req.body;

//     try {
//         const user = await User.findOne({ user_name });

//         if (!user) {
//             return res.status(400).json({ message: "User not found" });
//         }

//         const isMatch = await bcrypt.compare(password, user.password);

//         if (!isMatch) {
//             return res.status(400).json({ message: "Invalid credentials" });
//         }

//         res.status(200).json({ message: "Login successful", user: user });
//     } catch (error) {
//         console.error("Error logging in:", error);
//         res.status(500).json({ message: "Error logging in", error: error.message });
//     }
// });

// // Request Password Reset Route (sends reset token)
// router.post('/request-password-reset', async (req, res) => {
//     const { userId } = req.body;  // Using userId instead of user_name

//     try {
//         const user = await User.findById(userId);  // Find user by userId

//         if (!user) {
//             return res.status(400).json({ message: "User not found" });
//         }

//         const resetToken = await generateResetToken(user);
//         console.log(`Reset token for user ${userId}: ${resetToken}`);

//         res.status(200).json({
//             message: 'Reset token generated and sent',
//             resetToken: resetToken
//         });
//     } catch (error) {
//         console.error("Error generating reset token:", error);
//         res.status(500).json({ message: "Error generating reset token", error: error.message });
//     }
// });

// // Reset Password Route (actually updates the password)
// router.post('/reset-password', async (req, res) => {
//     const { reset_token, new_password } = req.body;

//     try {
//         const user = await User.findOne({ reset_token });

//         if (!user) {
//             return res.status(400).json({ message: "Invalid reset token" });
//         }

//         if (user.reset_token_expire < Date.now()) {
//             return res.status(400).json({ message: "Reset token has expired" });
//         }

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

// // Protected Route Example (auth middleware in use)
// router.get('/protected', auth, (req, res) => {
//     res.status(200).json({ message: "This is a protected route.", user: req.user });
// });

// export default router;
