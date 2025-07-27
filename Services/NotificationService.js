// ✅ Correctly import the Notification model
import Notification from '../models/NotificationModel.js';

class NotificationService {
  /**
   * Sends a notification through the core banking workflow system.
   * @param {Object} options
   * @param {String} options.ROLE_ID - The target role for the notification.
   * @param {String} options.message - The content of the notification.
   * @param {Number} options.WORK_ITEM_ID - The workflow item ID associated with the notification.
   * @param {String} [options.status] - Optional status (default: 'Pending')
   * @param {String} [options.notificationType] - Optional type (default: 'system')
   * @param {Number} [options.EVENT_ID] - Optional event ID
   * @param {Object} [options.metadata] - Optional metadata
   * @returns {Promise<{success: boolean, notification?: object, error?: string}>}
   */
  static async send(options) {
    try {
      const { ROLE_ID, message, WORK_ITEM_ID } = options;

      // Validate required fields
      if (!ROLE_ID || !message || !WORK_ITEM_ID) {
        console.warn('Notification missing required fields', {
          missingFields: {
            ROLE_ID: !ROLE_ID,
            message: !message,
            WORK_ITEM_ID: !WORK_ITEM_ID
          }
        });
        return { success: false, error: 'Missing required fields' };
      }

      // ✅ Construct new notification using imported Notification model
      const notification = new Notification({
        ROLE_ID,
        message,
        WORK_ITEM_ID,
        status: options.status || 'Pending',
        notificationType: options.notificationType || 'system',
        createdAt: new Date(),
        ...(options.EVENT_ID && { EVENT_ID: options.EVENT_ID }),
        ...(options.metadata && { metadata: options.metadata })
      });

      await notification.save();

      return { success: true, notification };

    } catch (error) {
      console.error('Notification processing error:', {
        error: error.message,
        stack: error.stack,
        input: options
      });
      return { success: false, error: error.message };
    }
  }
}

export default NotificationService;
