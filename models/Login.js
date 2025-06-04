import mongoose from 'mongoose';

// Define the schema for the User model
const UserSchema = new mongoose.Schema(
    {
        user_name: {
            type: String,
            required: true,
            unique: true, // Ensures that the username is unique in the database
        },
        password: {
            type: String,
            required: true, // Password is required for user authentication
        },
        roleId: {
            type: Number,
            required: true,
            ref: 'Permissions', // Reference to the Permissions model
        },
        resetToken: {
            type: String,
            default: null, // Reset token for password recovery
        },
        resetTokenExpire: {
            type: Date,
            default: null, // Expiry time for the reset token
        },
        loginAttempts: {
            type: Number,
            default: 0, // Tracks failed login attempts
        },
        lockUntil: {
            type: Date,
            default: null, // The time when the account is unlocked
        },
    },
    { timestamps: true } // Include timestamps (createdAt, updatedAt)
);

// Create and export the User model based on the schema
const User = mongoose.model('User', UserSchema);

export default User;
