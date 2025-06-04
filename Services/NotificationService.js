import NotificationModel from '../models/NotificationModel.js'; // For storing notifications in the database

class NotificationService {
    /**
     * Sends a notification through the core banking workflow system.
     * @param {Object} options
     * @param {String} options.ROLE_ID - The target role for the notification.
     * @param {String} options.message - The content of the notification.
     * @param {Number} options.WORK_ITEM_ID - The workflow item ID associated with the notification.
     * @param {Number} [options.EVENT_ID] - Optional event ID for tracking.
     * @param {String} [options.status="Pending"] - Optional status for the notification.
     * @param {String} [options.notificationType="system"] - Type of notification (default is "system").
     */
    static async send(options) {
        try {
            const {
                ROLE_ID,
                message,
                WORK_ITEM_ID,
                EVENT_ID,
                status = 'Pending',
                notificationType = 'system',
            } = options;

            // Validate required fields
            if (!ROLE_ID || !message || !WORK_ITEM_ID) {
                throw new Error('ROLE_ID, message, and WORK_ITEM_ID are required for sending notifications.');
            }

            // Step 1: Log the notification in the database
            const notification = new NotificationModel({
                ROLE_ID,
                message,
                WORK_ITEM_ID,
                EVENT_ID,
                status,
                notificationType,
                createdAt: new Date(),
            });

            await notification.save();
            console.log('Notification logged to database:', notification);

            // Optionally: Trigger the workflow system here directly if necessary
            // This could involve an API call or another service, but it doesn't need to be WF_WORK_ITEM

            // Assuming you have a different method or service to trigger workflow notifications
            // Example:
            // await SomeOtherService.triggerWorkflowNotification({
            //     ROLE_ID,
            //     message,
            //     WORK_ITEM_ID,
            //     EVENT_ID,
            // });

            return notification;
        } catch (error) {
            console.error('Error sending notification:', error.message);
            throw error; // Re-throw the error for controller-level handling
        }
    }
}

export default NotificationService;
