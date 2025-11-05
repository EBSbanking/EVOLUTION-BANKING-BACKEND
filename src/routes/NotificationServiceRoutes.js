import express from 'express';
import NotificationService from '../Services/NotificationService.js'; // Adjust path as needed
import NotificationModel from '../models/NotificationModel.js'; // Ensure correct path

const router = express.Router();

// POST route to send a notification
router.post('/send-notification', async (req, res) => {
    try {
        const { ROLE_ID, message, WORK_ITEM_ID, EVENT_ID, status, notificationType } = req.body;

        if (!ROLE_ID || !message || !WORK_ITEM_ID) {
            return res.status(400).json({
                success: false,
                message: 'ROLE_ID, message, and WORK_ITEM_ID are required.',
            });
        }

        const notification = await NotificationService.send({
            ROLE_ID,
            message,
            WORK_ITEM_ID,
            EVENT_ID,
            status,
            notificationType,
        });

        res.status(200).json({ success: true, notification });
    } catch (error) {
        console.error('Error sending notification:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET route to fetch notifications for a specific ROLE_ID
router.get('/notifications', async (req, res) => {
    try {
        const { ROLE_ID } = req.query;

        if (!ROLE_ID) {
            return res.status(400).json({
                success: false,
                message: 'ROLE_ID is required to fetch notifications.',
            });
        }

        const notifications = await NotificationModel.find({ ROLE_ID });

        res.status(200).json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
