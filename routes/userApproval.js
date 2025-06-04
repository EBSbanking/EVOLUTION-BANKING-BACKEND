const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Adjust the path if necessary

// Middleware to check if user is supervisor
const isSupervisor = (req, res, next) => {
    if (req.user && req.user.is_supervisor) { // Assuming req.user is populated with user data
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: You do not have permission to perform this action.' });
};

// Handle approval submission
router.post('/approve/:userId', isSupervisor, async (req, res) => {
    const { userId } = req.params;
    const { approved } = req.body; // Expecting a JSON body with an 'approved' field

    try {
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Assuming there's an `approved` field to update the user's status
        user.approved = approved; // You can change this to your actual field name
        await user.save();

        return res.status(200).json({ message: `User ${approved ? 'approved' : 'rejected'} successfully.`, user });
    } catch (error) {
        console.error('Error approving user:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    }
});

export default router; 
